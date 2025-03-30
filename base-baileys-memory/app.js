require('dotenv').config();
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MockAdapter = require('@bot-whatsapp/database/mock');
const path = require("path");
const fs = require("fs");
const chat = require("./chatGPT");
const { handlerAI } = require("./whisper");

// ==================== VALIDACIONES INICIALES ====================
const validateEnvironment = () => {
  const REQUIRED_ENV_VARS = ['OPENAI_API_KEY'];
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error(`❌ Error: Variables de entorno faltantes: ${missingVars.join(', ')}`);
    process.exit(1);
  }
};

const validateFiles = () => {
  const requiredFiles = [
    { path: path.join(__dirname, "mensaje", "menu.txt"), name: "menu.txt" },
    { path: path.join(__dirname, "mensaje", "promptConsultas.txt"), name: "promptConsultas.txt" }
  ];

  for (const file of requiredFiles) {
    try {
      if (!fs.existsSync(file.path)) {
        throw new Error(`Archivo ${file.name} no encontrado`);
      }
      const content = fs.readFileSync(file.path, "utf8");
      if (!content.trim()) {
        throw new Error(`Archivo ${file.name} está vacío`);
      }
    } catch (error) {
      console.error(`❌ Error al validar ${file.name}:`, error.message);
      process.exit(1);
    }
  }
};

validateEnvironment();
validateFiles();

// ==================== CONFIGURACIÓN ====================
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutos
const MAX_RETRIES = 2; // Intentos máximos para procesar audio

// Cargar archivos
const menu = fs.readFileSync(path.join(__dirname, "mensaje", "menu.txt"), "utf8");
const promptConsultas = fs.readFileSync(path.join(__dirname, "mensaje", "promptConsultas.txt"), "utf8");

// ==================== FUNCIONES UTILITARIAS ====================
const resetInactivityTimer = (ctxFn) => {
  if (ctxFn.inactivityTimer) {
    clearTimeout(ctxFn.inactivityTimer);
  }
  ctxFn.inactivityTimer = setTimeout(async () => {
    await ctxFn.flowDynamic("⏳ *Aviso de inactividad*: No hemos detectado interacción en los últimos 5 minutos. Volviendo al menú principal...");
    await ctxFn.gotoFlow(flowMainMenu);
  }, INACTIVITY_TIMEOUT);
};

const handleError = async (ctxFn, errorMessage) => {
  console.error("⚠️ Error:", errorMessage);
  await ctxFn.flowDynamic([
    "🔴 *Ocurrió un error inesperado*",
    "Por favor, intenta nuevamente o escribe *Menu* para volver al inicio."
  ]);
  await ctxFn.gotoFlow(flowMainMenu);
};

// ==================== FLUJOS PRINCIPALES ====================
const flowWelcome = addKeyword(EVENTS.WELCOME)
  .addAnswer([
    "🌟 *¡Bienvenido/a a Mission Produce!* 🌟",
    "",
    "Soy tu asistente virtual para:",
    "• Capacitación y onboarding 🎓",
    "• Soporte técnico 🛠️",
    "• Consultas generales 💡",
    "",
    "¡Estoy aquí para ayudarte! 😊"
  ])
  .addAnswer(
    "Escribe *Menu* en cualquier momento para ver las opciones disponibles o selecciona una de estas opciones rápidas:",
    { buttons: [
      { body: "📋 Iniciar onboarding" },
      { body: "🛠 Soporte técnico" },
      { body: "📅 Capacitaciones" }
    ]}
  )
  .addAction(async (ctx, ctxFn) => {
    resetInactivityTimer(ctxFn);
    const quickActions = {
      "📋 iniciar onboarding": () => ctxFn.gotoFlow(flowCapacitacion),
      "🛠 soporte técnico": () => ctxFn.gotoFlow(flowSoporte),
      "📅 capacitaciones": () => ctxFn.gotoFlow(flowCalendario)
    };
    
    const action = quickActions[ctx.body.toLowerCase()];
    if (action) return action();
    
    await ctxFn.gotoFlow(flowMainMenu);
  });

// ==================== FLUJO DE MENÚ PRINCIPAL ====================
const flowMainMenu = addKeyword(['menu', 'menú', 'inicio', 'opciones'])
  .addAnswer(menu, { delay: 1000 })
  .addAnswer(
    "Selecciona una opción del menú:",
    { 
      buttons: [
        { body: "1️⃣ Capacitación" },
        { body: "2️⃣ Recursos" },
        { body: "3️⃣ Soporte" },
        { body: "4️⃣ Calendario" }
      ],
      capture: true 
    }
  )
  .addAction(async (ctx, ctxFn) => {
    resetInactivityTimer(ctxFn);
    const opciones = {
      "1": () => ctxFn.gotoFlow(flowCapacitacion),
      "1️⃣": () => ctxFn.gotoFlow(flowCapacitacion),
      "capacitación": () => ctxFn.gotoFlow(flowCapacitacion),
      "2": () => ctxFn.gotoFlow(flowRecursos),
      "2️⃣": () => ctxFn.gotoFlow(flowRecursos),
      "recursos": () => ctxFn.gotoFlow(flowRecursos),
      "3": () => ctxFn.gotoFlow(flowSoporte),
      "3️⃣": () => ctxFn.gotoFlow(flowSoporte),
      "soporte": () => ctxFn.gotoFlow(flowSoporte),
      "4": () => ctxFn.gotoFlow(flowCalendario),
      "4️⃣": () => ctxFn.gotoFlow(flowCalendario),
      "calendario": () => ctxFn.gotoFlow(flowCalendario),
      "0": () => ctxFn.flowDynamic("👋 ¡Hasta pronto! Siempre puedes volver escribiendo *Menu*."),
      "salir": () => ctxFn.flowDynamic("👋 ¡Hasta pronto! Siempre puedes volver escribiendo *Menu*.")
    };

    const selectedOption = opciones[ctx.body.toLowerCase().trim()];
    if (selectedOption) {
      return selectedOption();
    }

    await ctxFn.flowDynamic([
      "❌ *Opción no reconocida*",
      "Por favor, selecciona una de las opciones del menú:",
      "1. Capacitación",
      "2. Recursos",
      "3. Soporte",
      "4. Calendario",
      "0. Salir"
    ]);
    return await ctxFn.gotoFlow(flowMainMenu);
  });

// ==================== FLUJO DE CAPACITACIÓN ====================
const flowCapacitacion = addKeyword(['1', 'capacitación', 'onboarding'])
  .addAnswer([
    "📚 *Menú de Capacitación*",
    "",
    "Selecciona el área sobre la que necesitas información:",
    "",
    "1. 🏢 Ingreso a la empresa",
    "2. 💻 Sistemas internos",
    "3. 📜 Políticas y normas",
    "4. 🎓 Desarrollo profesional",
    "0. ↩️ Volver al menú principal"
  ], { capture: true })
  .addAction(async (ctx, ctxFn) => {
    resetInactivityTimer(ctxFn);
    const opciones = {
      "1": () => ctxFn.gotoFlow(flowIngresoEmpresa),
      "ingreso": () => ctxFn.gotoFlow(flowIngresoEmpresa),
      "2": () => ctxFn.gotoFlow(flowUsoSistemas),
      "sistemas": () => ctxFn.gotoFlow(flowUsoSistemas),
      "3": () => ctxFn.gotoFlow(flowPoliticas),
      "políticas": () => ctxFn.gotoFlow(flowPoliticas),
      "4": () => ctxFn.gotoFlow(flowDesarrolloProfesional),
      "desarrollo": () => ctxFn.gotoFlow(flowDesarrolloProfesional),
      "0": () => ctxFn.gotoFlow(flowMainMenu),
      "volver": () => ctxFn.gotoFlow(flowMainMenu)
    };

    const selectedOption = opciones[ctx.body.toLowerCase().trim()];
    if (selectedOption) {
      return selectedOption();
    }

    await ctxFn.flowDynamic("Por favor, selecciona una opción válida del menú de capacitación.");
    return await ctxFn.gotoFlow(flowCapacitacion);
  });

// ==================== FLUJOS DE CAPACITACIÓN ESPECÍFICOS ====================
const createKnowledgeFlow = (keyword, title, description, examples) => {
  return addKeyword(keyword)
    .addAnswer([
      `📌 *${title}*`,
      "",
      description,
      "",
      "Ejemplos de consultas:",
      ...examples.map((ex, i) => `• ${ex}`)
    ])
    .addAnswer("¿Qué deseas saber sobre este tema?", { capture: true })
    .addAction(async (ctx, ctxFn) => {
      resetInactivityTimer(ctxFn);
      
      if (!ctx.body || ctx.body.trim().length < 3) {
        await ctxFn.flowDynamic("🔍 Por favor, escribe tu consulta con más detalles para poder ayudarte mejor.");
        return await ctxFn.gotoFlow(flowMainMenu);
      }

      try {
        const answer = await chat(promptConsultas, ctx.body);
        await ctxFn.flowDynamic([
          "💡 *Respuesta:*",
          answer.content || "No encontré información específica sobre tu consulta.",
          "",
          "¿Te quedó clara la información?",
          "1. Sí, gracias",
          "2. No, necesito más ayuda"
        ], { capture: true });

        // Manejar retroalimentación
        if (ctx.body === "2") {
          await ctxFn.flowDynamic("Vamos a crear un ticket para que un especialista te contacte.");
          await ctxFn.gotoFlow(flowSoporte);
        } else {
          await ctxFn.flowDynamic("¡Perfecto! ¿En qué más puedo ayudarte?");
          await ctxFn.gotoFlow(flowMainMenu);
        }
      } catch (error) {
        await handleError(ctxFn, error);
      }
    });
};

// Definición de flujos de conocimiento
const flowIngresoEmpresa = createKnowledgeFlow(
  ["1", "ingreso"],
  "Ingreso a la Empresa",
  "Todo lo que necesitas saber para tu incorporación a Mission Produce: documentación, procesos y beneficios.",
  [
    "¿Qué documentos debo presentar el primer día?",
    "¿Dónde es mi inducción?",
    "¿Cómo accedo a mis beneficios desde el inicio?"
  ]
);

const flowUsoSistemas = createKnowledgeFlow(
  ["2", "sistemas"],
  "Uso de Sistemas Internos",
  "Guías y ayuda para utilizar las plataformas digitales de la empresa.",
  [
    "¿Cómo accedo al portal de empleados?",
    "Problemas con mi correo corporativo",
    "¿Dónde registro mi asistencia?"
  ]
);

const flowPoliticas = createKnowledgeFlow(
  ["3", "políticas"],
  "Políticas y Normas",
  "Información sobre las políticas de la empresa y normas de conducta.",
  [
    "¿Dónde encuentro el código de conducta?",
    "Políticas de seguridad industrial",
    "Normas de vestimenta"
  ]
);

const flowDesarrolloProfesional = createKnowledgeFlow(
  ["4", "desarrollo"],
  "Desarrollo Profesional",
  "Oportunidades de crecimiento y capacitación en Mission Produce.",
  [
    "¿Qué cursos de capacitación hay disponibles?",
    "Programas de mentoría",
    "Cómo ascender en la empresa"
  ]
);

// ==================== FLUJO DE RECURSOS ====================
const flowRecursos = addKeyword(['2', 'recursos'])
  .addAnswer([
    "📂 *Recursos Disponibles*",
    "",
    "1. 📕 Manual del colaborador",
    "2. 📋 Políticas de la empresa",
    "3. 📞 Directorio de contactos",
    "4. 🏥 Guía de beneficios",
    "0. ↩️ Volver al menú principal"
  ], { capture: true })
  .addAction(async (ctx, ctxFn) => {
    resetInactivityTimer(ctxFn);
    const recursos = {
      "1": () => ctxFn.flowDynamic("📕 Descarga el manual aquí: [enlace seguro]"),
      "manual": () => ctxFn.flowDynamic("📕 Descarga el manual aquí: [enlace seguro]"),
      "2": () => ctxFn.flowDynamic("📋 Políticas disponibles en: [enlace seguro]"),
      "políticas": () => ctxFn.flowDynamic("📋 Políticas disponibles en: [enlace seguro]"),
      "3": () => ctxFn.flowDynamic("📞 Directorio de contactos importantes:\n• RRHH: ext. 123\n• Soporte TI: ext. 456"),
      "directorio": () => ctxFn.flowDynamic("📞 Directorio de contactos importantes:\n• RRHH: ext. 123\n• Soporte TI: ext. 456"),
      "4": () => ctxFn.flowDynamic("🏥 Guía de beneficios:\n• Salud\n• Seguro\n• Prestaciones\n[enlace seguro]"),
      "beneficios": () => ctxFn.flowDynamic("🏥 Guía de beneficios:\n• Salud\n• Seguro\n• Prestaciones\n[enlace seguro]"),
      "0": () => ctxFn.gotoFlow(flowMainMenu),
      "volver": () => ctxFn.gotoFlow(flowMainMenu)
    };

    const selectedOption = recursos[ctx.body.toLowerCase().trim()];
    if (selectedOption) {
      await selectedOption();
      return await ctxFn.gotoFlow(flowMainMenu);
    }

    await ctxFn.flowDynamic("Por favor, selecciona una opción válida del menú de recursos.");
    return await ctxFn.gotoFlow(flowRecursos);
  });

// ==================== FLUJO DE SOPORTE TÉCNICO ====================
const flowSoporte = addKeyword(['3', 'soporte', 'ayuda', 'problema'])
  .addAnswer([
    "🛠️ *Soporte Técnico*",
    "",
    "Para ayudarte mejor, por favor describe:",
    "1. ¿Qué sistema/aplicación presenta el problema?",
    "2. ¿Qué error o mensaje ves exactamente?",
    "3. ¿Cuándo comenzó el problema?",
    "",
    "Escribe tu descripción detallada:"
  ], { capture: true })
  .addAction(async (ctx, ctxFn) => {
    resetInactivityTimer(ctxFn);
    
    if (!ctx.body || ctx.body.trim().length < 15) {
      await ctxFn.flowDynamic([
        "❌ Descripción demasiado breve",
        "Para crear un ticket efectivo, necesitamos más detalles:",
        "- Nombre del sistema/aplicación",
        "- Mensaje de error exacto",
        "- Pasos para reproducir el problema",
        "",
        "Por favor, escribe una descripción más completa."
      ]);
      return await ctxFn.gotoFlow(flowSoporte);
    }

    const ticketNumber = `TKT-${Date.now().toString().slice(-6)}`;
    await ctxFn.flowDynamic([
      "✅ *Ticket creado exitosamente*",
      "",
      `📝 Número de ticket: *${ticketNumber}*`,
      "📌 Área: Soporte Técnico",
      "⏳ Tiempo estimado de respuesta: 24 horas hábiles",
      "",
      "Hemos registrado:",
      `"${ctx.body.substring(0, 200)}${ctx.body.length > 200 ? '...' : ''}"`,
      "",
      "¿Necesitas ayuda con algo más?"
    ]);

    return await ctxFn.gotoFlow(flowMainMenu);
  });

// ==================== FLUJO DE CALENDARIO ====================
const flowCalendario = addKeyword(['4', 'calendario', 'capacitaciones'])
  .addAnswer([
    "📅 *Próximas Capacitaciones*",
    "",
    "1. Seguridad Industrial - 15/04",
    "2. Uso de SAP Básico - 20/04",
    "3. Atención al Cliente - 25/04",
    "4. Normas de Calidad - 30/04",
    "",
    "Selecciona una para más detalles o escribe *inscribirme*:"
  ], { capture: true })
  .addAction(async (ctx, ctxFn) => {
    resetInactivityTimer(ctxFn);
    
    const capacitaciones = {
      "1": () => ctxFn.flowDynamic("🛡️ *Seguridad Industrial*\nFecha: 15/04\nDuración: 4 horas\nLugar: Sala de Capacitación A\nRequisitos: Ropa cómoda"),
      "seguridad": () => ctxFn.flowDynamic("🛡️ *Seguridad Industrial*\nFecha: 15/04\nDuración: 4 horas\nLugar: Sala de Capacitación A\nRequisitos: Ropa cómoda"),
      "2": () => ctxFn.flowDynamic("💻 *Uso de SAP Básico*\nFecha: 20/04\nDuración: 6 horas\nLugar: Sala de Computación\nRequisitos: Conocimientos básicos de Excel"),
      "sap": () => ctxFn.flowDynamic("💻 *Uso de SAP Básico*\nFecha: 20/04\nDuración: 6 horas\nLugar: Sala de Computación\nRequisitos: Conocimientos básicos de Excel"),
      "3": () => ctxFn.flowDynamic("😊 *Atención al Cliente*\nFecha: 25/04\nDuración: 5 horas\nLugar: Sala de Capacitación B\nRequisitos: Ninguno"),
      "cliente": () => ctxFn.flowDynamic("😊 *Atención al Cliente*\nFecha: 25/04\nDuración: 5 horas\nLugar: Sala de Capacitación B\nRequisitos: Ninguno"),
      "4": () => ctxFn.flowDynamic("📊 *Normas de Calidad*\nFecha: 30/04\nDuración: 3 horas\nLugar: Sala de Capacitación A\nRequisitos: Manual de calidad"),
      "calidad": () => ctxFn.flowDynamic("📊 *Normas de Calidad*\nFecha: 30/04\nDuración: 3 horas\nLugar: Sala de Capacitación A\nRequisitos: Manual de calidad"),
      "inscribirme": () => ctxFn.flowDynamic("📝 Para inscribirte en una capacitación, envía un correo a capacitacion@missionproduce.com con tu nombre y el curso de interés."),
      "0": () => ctxFn.gotoFlow(flowMainMenu),
      "volver": () => ctxFn.gotoFlow(flowMainMenu)
    };

    const selectedOption = capacitaciones[ctx.body.toLowerCase().trim()];
    if (selectedOption) {
      await selectedOption();
      return await ctxFn.gotoFlow(flowMainMenu);
    }

    await ctxFn.flowDynamic("Por favor, selecciona una opción válida del calendario.");
    return await ctxFn.gotoFlow(flowCalendario);
  });

// ==================== FLUJO DE MENSAJES DE VOZ ====================
const flowVoice = addKeyword(EVENTS.VOICE_NOTE)
  .addAnswer("🔊 Procesando tu mensaje de voz...")
  .addAction(async (ctx, ctxFn) => {
    resetInactivityTimer(ctxFn);
    
    try {
      let processedText = '';
      let attempts = 0;
      
      while (attempts < MAX_RETRIES && !processedText.trim()) {
        attempts++;
        processedText = await handlerAI(ctx);
        if (!processedText.trim() && attempts < MAX_RETRIES) {
          await ctxFn.flowDynamic("🤔 No logré entender el audio. Por favor, inténtalo de nuevo.");
        }
      }

      if (!processedText.trim()) {
        return await ctxFn.flowDynamic("❌ No pude procesar el audio. Por favor, escribe tu consulta o envía un audio más claro.");
      }

      const answer = await chat(promptConsultas, processedText);
      if (!answer?.content) {
        throw new Error("Respuesta vacía de ChatGPT");
      }
      
      await ctxFn.flowDynamic([
        "💬 *Entendí que dijiste:*",
        processedText,
        "",
        "📢 *Respuesta:*",
        answer.content
      ]);
      
      await ctxFn.flowDynamic("¿Te ayudó esta información? (responde Sí/No)");
    } catch (error) {
      await handleError(ctxFn, error);
    }
  });

// ==================== CONFIGURACIÓN PRINCIPAL ====================
const main = async () => {
  try {
    const adapterDB = new MockAdapter();
    const adapterProvider = createProvider(BaileysProvider);
    
    const adapterFlow = createFlow([
      flowWelcome,
      flowMainMenu,
      flowCapacitacion,
      flowIngresoEmpresa,
      flowUsoSistemas,
      flowPoliticas,
      flowDesarrolloProfesional,
      flowRecursos,
      flowSoporte,
      flowCalendario,
      flowVoice
    ]);

    await createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDB,
    });

    QRPortalWeb();
    console.log("✅ Bot iniciado correctamente");
  } catch (error) {
    console.error("❌ Error al iniciar el bot:", error);
    process.exit(1);
  }
};

main();