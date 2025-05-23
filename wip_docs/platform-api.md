# Platform API - Technical Documentation for Frontend Developers

## API Overview

The Platform API provides access to company information based on KRS (National Court Register) numbers through a secure, RESTful interface.

## Base URL

```
https://planform-backend.nicecoast-ed339f66.polandcentral.azurecontainerapps.io
```

## Authentication

All API requests require an API key passed in the `X-API-Key` header:

```
X-API-Key: your_api_key_here
```

## Endpoints

### GET /api/v1/companies/krs/{krs_number}

Retrieves company data by KRS number.

#### Parameters

| Name | Located in | Description | Required | Schema |
|------|------------|-------------|----------|--------|
| krs_number | path | 10-digit KRS number | Yes | string (pattern: `^\d{10}$`) |

#### Response Schema (CompanyResponse)

| Field | Type | Description |
|-------|------|-------------|
| krs_number | string | KRS identification number |
| company_name | string | Full company name |
| nip | string | Tax identification number |
| regon | string | Statistical identification number |
| legal_form | string | Legal form of the company |
| address_street | string | Street name |
| address_building_number | string | Building number |
| address_postal_code | string | Postal code |
| address_city | string | City |
| address_voivodeship | string | Voivodeship (province) |
| address_powiat | string | County (powiat) |
| address_gmina | string | Community (gmina) |
| address_country | string | Country (defaults to "POLSKA") |
| email | string | Company email |
| main_pkd_code | string | Main PKD (Polish Classification of Activities) code |
| main_pkd_description | string | Description of the main PKD activity |
| registration_date_krs | string | Date of registration in KRS |
| last_entry_date | string | Date of last registry entry update |
| share_capital_value | string | Value of share capital |
| share_capital_currency | string | Currency of share capital |

Note: All fields may be null if the data is not available.

#### Response Codes

| HTTP Code | Description |
|-----------|-------------|
| 200 | Successfully retrieved company data |
| 403 | Forbidden - Invalid API Key |
| 404 | Company not found (forwarded from external KRS API) |
| 422 | Validation Error - Invalid KRS number format |
| 500 | Internal server error |
| 502 | Error communicating with external KRS service |
| 504 | Gateway timeout contacting external KRS service |

#### Request Example

```http
GET /api/v1/companies/krs/0000803768 HTTP/1.1
Host: planform-backend.nicecoast-ed339f66.polandcentral.azurecontainerapps.io
Accept: application/json
X-API-Key: your_api_key_here
```

#### Sample JavaScript Code

```javascript
const fetchCompanyData = async (krsNumber, apiKey) => {
  try {
    const response = await fetch(
      `https://planform-backend.nicecoast-ed339f66.polandcentral.azurecontainerapps.io/api/v1/companies/krs/${krsNumber}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey
        }
      }
    );

    if (!response.ok) {
      const statusCode = response.status;
      if (statusCode === 403) {
        throw new Error('Invalid API key');
      } else if (statusCode === 404) {
        throw new Error(`Company with KRS number ${krsNumber} not found`);
      } else if (statusCode === 422) {
        throw new Error('Invalid KRS number format');
      } else if (statusCode === 502 || statusCode === 504) {
        throw new Error('External KRS service unavailable');
      } else if (statusCode === 500) {
        throw new Error('Internal server error');
      } else {
        throw new Error(`Unknown error: ${statusCode}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching company data:', error);
    throw error;
  }
};

// Example usage
fetchCompanyData('0000803768', 'your_api_key_here')
  .then(companyData => {
    console.log('Company information:', companyData);
    // Process the data as needed
  })
  .catch(error => {
    // Handle errors
    console.error('Failed to fetch company data:', error.message);
  });
```

## Additional Information

- The API is documented using OpenAPI specification, which is available at `/docs` or `/openapi.json`
- All data is returned as JSON with UTF-8 encoding
- KRS numbers must be exactly 10 digits, including leading zeros
- The API forwards requests to an external KRS service, so some errors (404, 502, 504) may originate from that service