import { tool } from 'ai';
import { z } from 'zod';

export const getCompanyByKRS = tool({
  description: 'Get company information by its KRS (National Court Register) number.',
  parameters: z.object({
    krs_number: z
      .string()
      .length(10, { message: 'KRS number must be exactly 10 characters long.' })
      .regex(/^\d+$/, { message: 'KRS number must contain only digits.' })
      // Keep the original refined message if needed, or adjust
      .refine((val) => /^\d{10}$/.test(val), { // Re-check with a simple test here for the original intent
        message: 'KRS number must be exactly 10 digits and consist only of digits.',
      }),
  }),
  execute: async ({ krs_number }) => {
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('!!!! [DEBUG] getCompanyByKRS execute() CALLED with krs_number:', krs_number, '!!!!');
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('[getCompanyByKRS EXECUTE] Called with krs_number:', krs_number);
    const baseURL = process.env.PLATFORM_API_BASE_URL;
    const apiKey = process.env.PLATFORM_API_KEY;
    console.log('[getCompanyByKRS EXECUTE] PLATFORM_API_BASE_URL:', baseURL);
    console.log('[getCompanyByKRS EXECUTE] PLATFORM_API_KEY:', apiKey ? "SET" : "NOT SET"); // Don't log the key itself

    if (!baseURL || !apiKey) {
      console.error('PLATFORM_API_BASE_URL or PLATFORM_API_KEY is not set.');
      throw new Error('API configuration is missing. Cannot fetch company data.');
    }

    try {
      const response = await fetch(
        `${baseURL}/api/v1/companies/krs/${krs_number}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-API-Key': apiKey,
          },
        },
      );

      if (!response.ok) {
        const statusCode = response.status;
        let errorMessage = `Error fetching company data. Status: ${statusCode}`;
        try {
          // Try to parse error from API if available
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (e) {
          // Ignore if error response is not JSON or empty
        }

        switch (statusCode) {
          case 403:
            // Let the LLM know it's an API key issue, but don't expose the key itself.
            console.error('Platform API returned 403 Forbidden. Check API Key.');
            return { error: 'Access to the company data service was denied. Please check the API configuration.' };
          case 404:
            return { error: `Company with KRS number ${krs_number} not found.` };
          case 422:
            return { error: `Invalid KRS number format for ${krs_number}. It must be 10 digits.` };
          case 500:
            return { error: 'An internal server error occurred while fetching company data.' };
          case 502:
          case 504:
            return { error: 'The external KRS service is currently unavailable. Please try again later.' };
          default:
            // For other errors, return a generic message or the specific one from API.
            return { error: `Failed to fetch company data: ${errorMessage}` };
        }
      }

      return await response.json();
    } catch (error) {
      console.error('Network or other error fetching company data:', error);
      // Provide a structured error that the LLM can understand
      if (error instanceof Error) {
        return { error: `An unexpected error occurred: ${error.message}` };
      }
      return { error: 'An unexpected error occurred while trying to fetch company data.' };
    }
  },
}); 