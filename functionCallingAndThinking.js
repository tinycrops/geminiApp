// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node

import {
  GoogleGenAI,
  Type,
} from '@google/genai';

async function main() {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'getWeather',
          description: 'gets the weather for a requested city',
          parameters: {
            type: Type.OBJECT,
            properties: {
              city: {
                type: Type.STRING,
              },
            },
          },
        },
      ],
    }
  ];
  const config = {
    tools,
    responseMimeType: 'text/plain',
    systemInstruction: [
        {
          text: `test`,
        }
    ],
  };
  const model = 'gemini-2.5-flash-preview-04-17';
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `test rochester ny
`,
        },
      ],
    },
    {
      role: 'model',
      parts: [
        {
          text: `1.  **Search**: The user is asking for "rochester ny". This looks like a location.

2.  **Parameters**: The user provided "rochester ny". The \`getWeather\` tool takes a \`city\` parameter. "rochester ny" fits the description of a city.

3.  **Parameters mapping**: Map "rochester ny" to the \`city\` parameter of the \`getWeather\` tool.

4.  **Tool**: The \`getWeather\` tool is relevant as the user seems to be asking for weather information for the specified location.

5.  **Function Call**: Call \`getWeather\` with \`city="rochester ny"\`.`,
        },
        {
          functionCall: {
            name: `getWeather`,
            args: {"city":"rochester ny"},
          }
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: `getWeather`,
            response: {
              output: `test return`,
            },
          }
        },
      ],
    },
    {
      role: 'model',
      parts: [
        {
          text: `I can get the weather for Rochester, NY.`,
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          text: `INSERT_INPUT_HERE`,
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });
  for await (const chunk of response) {
    console.log(chunk.functionCalls ? chunk.functionCalls[0] : chunk.text);
  }
}

main();
