const { Configuration, OpenAIApi } = require("openai");

const chat = async (prompt, text) => {
  try {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
    });
    return completion.data.choices[0].message;
  } catch (err) {
    // Si el error es 429 (demasiadas solicitudes)
    if (err.response && err.response.status === 429) {
      console.error("Error 429: Too Many Requests. La API está limitando las solicitudes.");
      return { content: "Demasiadas solicitudes, por favor espera unos instantes e intenta de nuevo." };
    }
    // Para otros errores
    console.error("Error al conectar con OpenAI:", err);
    return { content: "Ocurrió un error inesperado. Por favor, intenta de nuevo más tarde." };
  }
};

module.exports = chat;
