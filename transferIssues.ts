import { Octokit } from "@octokit/core";

// GitHubのPersonal Access TokenでOctokitクライアントを作成
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  request: {
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2024-11-11"
    }
  }
});

// ======================================
// 設定
// ======================================
const sourceRepo = "my/source_repo"; // ソースリポジトリ
const targetRepo = "my/target_repo"; // ターゲットリポジトリ
const labelToAdd = "sample"; // 付与したいラベル名
const labelColor = "b60205"; // ラベル新規作成時のカラー
const projectId = "PVT_xxxxxxxxxxxxxxxx"; // Github ProjectsのプロジェクトID
const statusToFilter = ""; // 絞り込みたいステータス
const dryRun = false; // Dry Runモード（trueでシミュレーションのみ実行）
// ======================================

// 設定情報を出力
function printConfig() {
  console.log("Configuration:");
  console.log(`  Source Repository: ${sourceRepo}`);
  console.log(`  Target Repository: ${targetRepo}`);
  console.log(`  Label to Add: ${labelToAdd}`);
  console.log(`  Project ID: ${projectId}`);
  console.log(`  Status to Filter: ${statusToFilter}`);
  console.log(`  Dry Run Mode: ${dryRun ? "Enabled" : "Disabled"}`);
}

// ターゲットリポジトリのNode IDを取得する関数
async function getRepoNodeId(repo: string): Promise<string> {
  const [owner, name] = repo.split('/');
  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
      }
    }
  `;
  const response = await octokit.graphql(query, { owner, name });
  return response.repository.id;
}

// ソースリポジトリの特定のIssueのNode IDを取得する関数
async function getIssueNodeId(repo: string, issueNumber: number): Promise<string | null> {
  const [owner, name] = repo.split('/');
  const query = `
    query($owner: String!, $name: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $issueNumber) {
          id
        }
      }
    }
  `;
  try {
    const response = await octokit.graphql(query, { owner, name, issueNumber });
    return response.repository.issue.id;
  } catch (error) {
    console.log(`Issue #${issueNumber} does not exist in ${repo}. Skipping transfer.`);
    return null;
  }
}

// 転送対象のIssueを取得してフィルタリングする関数（ページネーション対応）
async function fetchIssuesToTransfer(): Promise<number[]> {
  const issuesToTransfer: number[] = [];
  let hasNextPage = true;
  let afterCursor: string | null = null;

  const itemsQuery = `
    query($projectId: ID!, $after: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100, after: $after) {
            nodes {
              content {
                ... on Issue {
                  number
                  id
                }
              }
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                  }
                }
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const variables = { projectId, after: afterCursor };
    const response = await octokit.graphql(itemsQuery, variables) as IssueResponse;

    if (!response.node || !response.node.items) {
      throw new Error("No items found in the project.");
    }

    response.node.items.nodes.forEach((item) => {
      if (item.content && item.content.number !== undefined) {
        const statusField = item.fieldValues.nodes.find((field) => field.name === statusToFilter);
        if (statusField) {
          issuesToTransfer.push(item.content.number);
        }
      }
    });

    hasNextPage = response.node.items.pageInfo.hasNextPage;
    afterCursor = response.node.items.pageInfo.endCursor;
  }

  return issuesToTransfer;
}

// Issueをターゲットリポジトリに転送し、ラベルを付与する関数
async function transferAndLabelIssue(issueId: string, targetRepoId: string, issueNumber: number): Promise<void> {
  try {
    if (dryRun) {
      console.log(`[Dry Run] Would transfer issue #${issueNumber} to repository with ID: ${targetRepoId}`);
    } else {
      const mutation = `
        mutation($issueId: ID!, $targetRepoId: ID!) {
          transferIssue(input: { issueId: $issueId, repositoryId: $targetRepoId }) {
            issue {
              id
              number
              title
              url
            }
          }
        }
      `;

      const variables = { issueId, targetRepoId };
      const response = await octokit.graphql(mutation, variables);

      console.log(`Issue #${response.transferIssue.issue.number} ${response.transferIssue.issue.title} transferred successfully.`);

      // ラベル付与処理
      await addLabelToIssue(response.transferIssue.issue.id);
    }
  } catch (error) {
    console.error(`Error transferring issue #${issueNumber}:`, error);
  }
}

// ラベルを付与するGraphQL処理
async function addLabelToIssue(issueId: string): Promise<void> {
  try {
    if (dryRun) {
      console.log(`[Dry Run] Would add label "${labelToAdd}" to issue with ID: ${issueId}`);
    } else {
      const labelId = await getOrCreateLabelId();

      const mutation = `
        mutation($labelableId: ID!, $labelIds: [ID!]!) {
          addLabelsToLabelable(input: { labelableId: $labelableId, labelIds: $labelIds }) {
            clientMutationId
          }
        }
      `;
      const variables = { labelableId: issueId, labelIds: [labelId] };
      await octokit.graphql(mutation, variables);
      console.log(`Label "${labelToAdd}" added to issue with ID: ${issueId}.`);
    }
  } catch (error) {
    console.error(`Error adding label to issue with ID ${issueId}:`, error);
  }
}

// ラベルが存在しなければ作成し、ラベルIDを取得する関数
async function getOrCreateLabelId(): Promise<string> {
  const query = `
    query($owner: String!, $name: String!, $labelName: String!) {
      repository(owner: $owner, name: $name) {
        label(name: $labelName) {
          id
        }
      }
    }
  `;
  const [owner, name] = targetRepo.split("/");
  const variables = { owner, name, labelName: labelToAdd };

  const response = await octokit.graphql(query, variables);
  if (response.repository.label) {
    return response.repository.label.id;
  } else {
    return await createLabelAndReturnId();
  }
}

// ラベルを作成してラベルIDを返す関数
async function createLabelAndReturnId(): Promise<string> {
  const mutation = `
    mutation($repositoryId: ID!, $name: String!, $color: String!, $description: String) {
      createLabel(input: { repositoryId: $repositoryId, name: $name, color: $color, description: $description }) {
        label {
          id
        }
      }
    }
  `;
  const targetRepoId = await getRepoNodeId(targetRepo);
  const variables = {
    repositoryId: targetRepoId,
    name: labelToAdd,
    color: labelColor,
    description: "Indicates the issue was transferred"
  };

  const response = await octokit.graphql(mutation, variables);
  console.log(`Label "${labelToAdd}" created.`);
  return response.createLabel.label.id;
}

// メイン処理
async function main() {
  printConfig();
  const issues = await fetchIssuesToTransfer();

  // Issue番号指定したい場合はこんな感じで
  // const issues = [728]

  console.log("Issues to transfer:", issues);

  const targetRepoId = await getRepoNodeId(targetRepo);

  for (const issueNumber of issues) {
    const issueId = await getIssueNodeId(sourceRepo, issueNumber);
    if (issueId) {
      await transferAndLabelIssue(issueId, targetRepoId, issueNumber);
    }
  }
}

// 実行
main();
