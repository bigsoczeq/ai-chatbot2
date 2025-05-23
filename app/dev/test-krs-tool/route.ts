import { streamText } from 'ai';
import { getCompanyByKRS } from '../../../lib/ai/tools/get-company-by-krs';
import { myProvider } from '../../../lib/ai/providers'; // Restored custom provider
// import { createAzure } from '@ai-sdk/azure'; // Reverted direct Azure SDK usage

export const dynamic = 'force-dynamic'; // Ensure fresh execution

export async function GET() {
  console.log('[Test KRS Tool Route] GET handler started. Attempting to call LLM with getCompanyByKRS tool.');

  try {
    // Reverted to using myProvider
    // const azureService = createAzure({
    //   baseURL: process.env.AZURE_OPENAI_ENDPOINT,
    //   apiKey: process.env.AZURE_OPENAI_API_KEY,
    //   apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    // });
    // const model = azureService(process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1');

    const result = await streamText({
      model: myProvider.languageModel('azure-openai-model'), // Using myProvider again
      messages: [
        { role: 'system', content: 'You are a helpful assistant that MUST use available tools to answer questions about companies. When asked for company information via a KRS number, you MUST use the getCompanyByKRS tool.' },
        { role: 'user', content: 'Use the getCompanyByKRS tool to find details for KRS number 0000123456.' },
      ],
      tools: {
        getCompanyByKRS,
      },
      // toolChoice: { // Reverted: Removed toolChoice
      //   type: 'tool',
      //   toolName: 'getCompanyByKRS'
      // }
      // onToolCall: ({ toolCall, finish }) => { // Reverted due to SDK typing issues
      //   console.log('[Test KRS Tool Route] onToolCall triggered:', JSON.stringify(toolCall, null, 2));
      // }
    });

    let responseText = '';
    for await (const delta of result.textStream) {
      responseText += delta;
    }
    
    const toolCalls = await result.toolCalls;
    const toolResults = await result.toolResults;

    if (toolCalls && toolCalls.length > 0) {
      console.log('[Test KRS Tool Route] LLM decided to call tools:', JSON.stringify(toolCalls, null, 2));
    } else {
      console.log('[Test KRS Tool Route] LLM did not decide to call any tools. LLM Response:', responseText);
    }

    if (toolResults && toolResults.length > 0) {
        console.log('[Test KRS Tool Route] Tool execution results:', JSON.stringify(toolResults, null, 2));
    }

    console.log('[Test KRS Tool Route] streamText call processed. Check server logs for the DEBUG messages from getCompanyByKRS.execute().');

    return new Response(
      JSON.stringify({
        message: 'Test triggered. Check server console for DEBUG logs from getCompanyByKRS.execute().',
        llmResponse: responseText,
        toolCalls: toolCalls || [],
        toolResults: toolResults || [],
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('[Test KRS Tool Route] Error during test:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to execute test for getCompanyByKRS tool.',
        details: error.message || error.toString(),
        stack: error.stack,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
} 