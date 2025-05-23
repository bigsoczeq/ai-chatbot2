import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { xai } from '@ai-sdk/xai';
import { createAzure } from '@ai-sdk/azure';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

// Create an Azure OpenAI provider instance
const azureOpenAI = createAzure({
  // Ensure AZURE_OPENAI_ENDPOINT is like: https://<your-resource-name>.openai.azure.com/openai/deployments
  // (without a trailing slash and without the specific deployment name)
  baseURL: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  // Ensure AZURE_OPENAI_API_VERSION matches the one expected by your deployment (e.g., 2025-01-01-preview)
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
  fetch: async (url, options) => {
    console.log('[Azure OpenAI Request Log] URL:', url.toString());
    console.log('[Azure OpenAI Request Log] Options:', JSON.stringify(options, null, 2));

    const response = await fetch(url, options);

    console.log('[Azure OpenAI Response Log] Status:', response.status);
    // const responseBody = await response.clone().text(); // DO NOT CONSUME THE BODY HERE
    // console.log('[Azure OpenAI Response Log] Body:', responseBody); // Log only metadata if body is streamed

    // If you need to inspect the body for logging while still allowing the SDK to stream it,
    // you would need a more complex setup involving Teeing the stream, which is generally not recommended
    // for simple logging due to potential performance impacts and complexity.
    // For now, let's assume the SDK will handle logging of the streamed chunks if needed, or use its telemetry.

    return response;
  },
});

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': xai('grok-2-vision-1212'),
        'azure-openai-model': azureOpenAI(process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1'),
        'chat-model-reasoning': wrapLanguageModel({
          model: xai('grok-3-mini-beta'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': xai('grok-2-1212'),
        'artifact-model': xai('grok-2-1212'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });
