import { AzureOpenAI } from "openai";

export async function GET() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

  if (!endpoint || !apiKey || !apiVersion || !deploymentName) {
    return new Response(
      "<h1>Configuration Error</h1><p>Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION, and AZURE_OPENAI_DEPLOYMENT_NAME environment variables.</p>",
      {
        headers: { "Content-Type": "text/html" },
        status: 500,
      }
    );
  }

  try {
    const client = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion,
      deployment: deploymentName,
    });

    const response = await client.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        {
          role: "user",
          content: "I am going to Paris, what should I see?",
        },
      ],
      model: deploymentName,
      max_tokens: 800,
      temperature: 1,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const messageContent = response.choices[0]?.message?.content;

    return new Response(
      `<!DOCTYPE html>
<html>
  <head>
    <title>Azure OpenAI Test</title>
  </head>
  <body>
    <h1>Azure OpenAI Test Response:</h1>
    <pre>${messageContent || "No content returned."}</pre>
  </body>
</html>`,
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  } catch (error: any) {
    console.error("Azure OpenAI API error:", error);
    return new Response(
      `<h1>Error</h1><p>Failed to get response from Azure OpenAI.</p><pre>${error.message || error.toString()}</pre>`,
      {
        headers: { "Content-Type": "text/html" },
        status: 500,
      }
    );
  }
} 