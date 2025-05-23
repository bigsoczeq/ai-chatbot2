import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  smoothStream,
  streamText,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { getCompanyByKRS } from '@/lib/ai/tools/get-company-by-krs';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import { vercelSDKErrorHandler } from '@/lib/ai/error-handler';

export const maxDuration = 60;

// Temporarily commenting out resumable stream context for diagnostics
// let globalStreamContext: ResumableStreamContext | null = null;

// Re-enable getStreamContext function definition
function getStreamContext() {
  // if (!globalStreamContext) { // Keep the actual global context var commented to ensure it starts null for POST
  //   try {
  //     globalStreamContext = createResumableStreamContext({
  //       waitUntil: after,
  //     });
  //   } catch (error: any) {
  //     if (error.message.includes('REDIS_URL')) {
  //       console.log(
  //         ' > Resumable streams are disabled due to missing REDIS_URL',
  //       );
  //     } else {
  //       console.error(error);
  //     }
  //   }
  // }
  // return globalStreamContext;

  // For the purpose of this diagnostic step, make getStreamContext always return null
  // or a version that doesn't rely on the global variable that POST is avoiding.
  // This ensures GET doesn't break due to Redis and POST tests the direct streamText.
  // A proper fix would involve conditional Redis setup.
  try {
    // Attempt to create a context, but it will be null if REDIS_URL is missing
    return createResumableStreamContext({ waitUntil: after });
  } catch (error:any) {
    if (error.message.includes('REDIS_URL')) {
      console.log(
        ' > Resumable streams are disabled for GET due to missing REDIS_URL',
      );
    } else {
      console.error('[getStreamContext for GET] Error:', error);
    }
    return null;
  }
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;
  console.log('[Chat API] POST handler started');

  try {
    const json = await request.json();
    console.log('[Chat API] Request JSON parsed:', json);
    requestBody = postRequestBodySchema.parse(json);
    console.log('[Chat API Request Log] Selected Chat Model:', requestBody.selectedChatModel);
  } catch (error) {
    console.error('[Chat API] Error parsing request body:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Temporarily simplifying streamText handling for diagnostics
    // const stream = createDataStream({
    //   execute: (dataStream) => {
    const result = streamText({
      model: myProvider.languageModel(selectedChatModel),
      system: systemPrompt({ selectedChatModel, requestHints }),
      messages,
      maxSteps: 5, // Important for multi-step server-side tool calls
      experimental_transform: smoothStream({ chunking: 'word' }),
      experimental_generateMessageId: generateUUID,
      tools: {
        getCompanyByKRS,
        // Potentially add other tools here if they are server-side and should auto-execute
      },
      onFinish: async ({ response, toolCalls, toolResults }) => {
        console.log('[Chat API] streamText onFinish triggered.');
        if (toolCalls && toolCalls.length > 0) {
          console.log('[Chat API] onFinish: Tool calls made by LLM:', JSON.stringify(toolCalls, null, 2));
        }
        if (toolResults && toolResults.length > 0) {
          console.log('[Chat API] onFinish: Tool results:', JSON.stringify(toolResults, null, 2));
        }

        if (session.user?.id) {
          try {
            const assistantId = getTrailingMessageId({
              messages: response.messages.filter(
                (message) => message.role === 'assistant',
              ),
            });

            if (!assistantId) {
              console.error('[Chat API] onFinish: No assistant message found after streamText!');
              throw new Error('No assistant message found!');
            }

            const [, assistantMessage] = appendResponseMessages({
              messages: [message], // original user message
              responseMessages: response.messages, // messages from streamText (includes user, assistant, tool_invocations, tool_results)
            });

            console.log('[Chat API] onFinish: Saving assistant message parts:', JSON.stringify(assistantMessage.parts, null, 2));

            await saveMessages({
              messages: [
                {
                  id: assistantId,
                  chatId: id,
                  role: assistantMessage.role,
                  parts: assistantMessage.parts, // Ensure parts (including tool invocations/results) are saved
                  attachments:
                    assistantMessage.experimental_attachments ?? [],
                  createdAt: new Date(),
                },
              ],
            });
            console.log('[Chat API] onFinish: Assistant message saved successfully.');
          } catch (saveError) {
            console.error('[Chat API] onFinish: Failed to save chat messages:', saveError);
          }
        }
      },
      experimental_telemetry: {
        isEnabled: isProductionEnvironment,
        functionId: 'stream-text',
      },
    });

    //     result.consumeStream(); // Not needed when using toDataStreamResponse directly with streamText
    //     result.mergeIntoDataStream(dataStream, { // Not needed for this simplified approach
    //       sendReasoning: true,
    //     });
    //   },
    //   onError: (error) => { // This onError is for createDataStream, not streamText directly
    //     console.error('[Chat API] createDataStream onError:', error);
    //     return 'Oops, an error occurred handling the data stream!';
    //   },
    // });

    // const streamContext = getStreamContext();

    // if (streamContext) {
    //   return new Response(
    //     await streamContext.resumableStream(streamId, () => stream),
    //   );
    // } else {
    //   return new Response(stream);
    // }

    return result.toDataStreamResponse({ getErrorMessage: vercelSDKErrorHandler });

  } catch (error) {
    console.error('[Chat API] POST handler general error:', error); // Log the general error
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    // Fallback for other unexpected errors
    return new Response(JSON.stringify({ error: 'An unexpected server error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(request: Request) {
  // const streamContext = getStreamContext(); // Temporarily commented out
  const resumeRequestedAt = new Date();

  // if (!streamContext) { // Temporarily commented out
  //   return new Response(null, { status: 204 });
  // }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  // Temporarily revert to original resumable stream logic, but it will be effectively
  // disabled if globalStreamContext is not initialized due to earlier commenting.
  // This is to avoid introducing new errors in GET while focusing on POST.
  const streamContext = getStreamContext(); // Re-enable for GET, but will be null if Redis is off
  if (!streamContext) {
    // If resumable streams are off, we can't resume, send no content or appropriate error.
    // This matches one of the original paths if globalStreamContext was null.
    return new Response(null, { status: 204 });
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });
  
  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
