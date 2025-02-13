// redirect url
chrome.declarativeNetRequest.updateDynamicRules({
  addRules: [
    {
      id: 1,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          transform: {
            host: "leetcode.com",
          },
        },
      },
      condition: {
        urlFilter: "leetcode.cn/problems/",
        resourceTypes: ["main_frame"],
      },
    },
  ],
  removeRuleIds: [1],
});

// save to database
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveProblem") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      const tabUrl = tabs[0].url;
      console.log("Executing script on tab:", tabUrl);

      // Execute the extractProblemData in the context of the active tab
      chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          function: extractProblemData, // This function will run inside the active tab's context
          args: [tabUrl],
        })
        .then((results) => {
          if (results && results[0] && results[0].result) {
            const problemData = results[0].result;
            console.log("Extracted Problem Data:", problemData);

            // Now send this data to Notion API
            sendToNotion(problemData);
          }
        })
        .catch((error) => {
          console.error("Error executing script:", error);
        });
    });

    sendResponse({ status: "Saving started" });
  }
});

chrome.storage.sync.set(
  {
    notionToken: "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",
    notionDatabaseId: "115e683beaca8089846bd9e22b4f1220",
  },
  function () {
    console.log("Credentials saved successfully!");
  }
);

// Function to extract problem details from the active tab
function extractProblemData(tabUrl) {
  const title =
    document
      .querySelector("a.no-underline.cursor-text.whitespace-normal")
      ?.innerText.split(".")
      .map((s) => s.trim()) || "No title";
  const contestRating =
    document.querySelector("div.flex.gap-1 > div.text-caption")?.innerText ||
    "N/A";
  const difficulty = document
    .querySelector("div.flex.gap-1 > div.text-caption")
    .classList.value.split(" ")
    .filter((s) => s.includes("difficulty"))[0]
    .split("-")[2];

  const description =
    document
      .querySelector("div[data-track-load='description_content']")
      ?.innerText.split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0) || "No description";
  const constraints = document.querySelector(
    "div[data-track-load='description_content']"
  );

  const problemNumber = title[0];
  const titleName = title[1];

  return {
    problemNumber,
    problemLink: tabUrl,
    title: titleName,
    difficulty,
    contestRating,
    description,
  };
}

// Function to send extracted data to Notion
function sendToNotion(problemData) {
  chrome.storage.sync.get(["notionToken", "notionDatabaseId"], (data) => {
    const NOTION_TOKEN = data.notionToken;
    const NOTION_DATABASE_ID = data.notionDatabaseId;
    const TEMPLATE_PAGE_ID = "Question-115e683beaca8049bb1bc8df4500fb23";

    if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
      console.error("Notion credentials missing!");
      return;
    }

    const { problemConstraints, problemExamples, problemStatement } =
      separateProblemDescriptions(problemData.description);

    fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          Question: { title: [{ text: { content: problemData.title } }] },
          "No.": { number: Number(problemData.problemNumber) },
          "Contest Rating": { number: Number(problemData.contestRating) },
          "Question Link": { url: problemData.problemLink },
          "Problem Progress": { status: { name: "In progress" } },
          "Difficulty Level": {
            select: { name: capitalizeFirstLetter(problemData.difficulty) },
          },
        },

        // this is a hardcoded template, very ugly
        children: [
          // Table of Contents
          {
            object: "block",
            type: "table_of_contents",
            table_of_contents: {},
          },
          // H1: Problem Statement
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [
                { type: "text", text: { content: "Problem Statement" } },
              ],
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: problemStatement,
                  },
                },
              ],
            },
          },
          // H1: Constraints
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ type: "text", text: { content: "Constraints" } }],
            },
          },
          ...problemConstraints.map((constraint) => ({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: constraint,
                  },
                },
              ],
            },
          })),
          // H1: Approach
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ type: "text", text: { content: "Approach" } }],
            },
          },
        ],
      }),
    })
      .then((response) => response.json())
      .then((data) => console.log("Saved to Notion:", data))
      .catch((error) => console.error("Error:", error));
  });
}

function capitalizeFirstLetter(val) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

function separateProblemDescriptions(description) {
  let exampleIndex = -1;
  let constraintsIndex = -1;
  for (let i = 0; i < description.length; i++) {
    if (description[i].includes("Example 1")) {
      exampleIndex = i;
    }
    if (description[i].includes("Constraints")) {
      constraintsIndex = i;
    }
  }

  const problemStatement = description.slice(0, exampleIndex).join(" ");
  const problemExamples = description.slice(exampleIndex, constraintsIndex);
  const problemConstraints = description.slice(constraintsIndex + 1);
  return { problemStatement, problemExamples, problemConstraints };
}
