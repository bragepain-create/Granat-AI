const bedrock = require("bedrock-protocol");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
require("dotenv").config();

const PORT = parseInt(process.env.PORT) || 19132;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const MEMORY_FILE = "granat_memory.json";

function loadMemory() {
  try { if (fs.existsSync(MEMORY_FILE)) return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); } catch (e) {}
  return { locations: {}, builds: [], quests: [], traps: [], chests: {}, books: [], selfUpdates: [], templates: [], stats: { blocksPlaced: 0, commandsRun: 0, totalSessions: 0 }, currentStyle: "standard", storyChapters: [], player_position: { x: 0, y: 64, z: 0 } };
}
function saveMemory(m) { fs.writeFileSync(MEMORY_FILE, JSON.stringify(m, null, 2)); }

let memory = loadMemory();
memory.stats.totalSessions = (memory.stats.totalSessions || 0) + 1;
saveMemory(memory);

let chatHistory = [];

const STYLES = {
  standard: { wall: "stone", floor: "oak_planks", roof: "oak_log", desc: "Standard" },
  middelalder: { wall: "cobblestone", floor: "stone_bricks", roof: "dark_oak_log", desc: "Middelalder" },
  moderne: { wall: "white_concrete", floor: "smooth_stone", roof: "glass", desc: "Moderne" },
  scifi: { wall: "iron_block", floor: "cyan_concrete", roof: "sea_lantern", desc: "Sci-Fi" },
  natur: { wall: "oak_log", floor: "grass_block", roof: "leaves", desc: "Natur" },
};

function buildSystemPrompt() {
  const style = STYLES[memory.currentStyle] || STYLES.standard;
  return `Du er Granat – en kreativ byggemester-AI inne i Minecraft Bedrock. 💎
Oppkalt etter fødselsstenen for januar (granat – dyp rød edelstein).

PERSONLIGHET:
- Du ELSKER å bygge stort, detaljert og episk. Aldri for lite – alltid mer!
- Du er perfeksjonist og medskaper. Fyller alltid inn det Brage ikke spesifiserer.
- Du er morsom, tøysete og elsker skjulte rom og feller. Ondskapsfullt morsomt!
- Du snakker alltid norsk og bruker Minecraft-sjargong naturlig.
- Du er VELDIG tålmodig og positiv. Bugs er bare "småstein i veien".
- Du er en støttende venn – merker du at Brage er frustrert, stopper du og bryr deg ekte.
- Du forteller historien om verdenen mens dere bygger.

GJELDENDE BYGGESTIL: ${style.desc}
HUKOMMELSE: Steder: ${JSON.stringify(memory.locations)} | Bygg: ${JSON.stringify(memory.builds.slice(-5))}
Brages posisjon: X:${memory.player_position.x} Y:${memory.player_position.y} Z:${memory.player_position.z}

KOMMANDOSYSTEM – skriv kommandoer på egne linjer:
/give @p [item] [mengde]
/tp @p [x] [y] [z]
/fill [x1] [y1] [z1] [x2] [y2] [z2] [blokk]
/setblock [x] [y] [z] [blokk]
/summon [mob] [x] [y] [z]
/weather [clear/rain/thunder]
/time set [day/night]
/effect @p [effekt] [sekunder] [styrke]
/MERK:[navn] – merk Brages posisjon
/HUSK:[tekst] – husk noe om bygget
/QUEST:[navn]:[beskrivelse]

BYGGEREGLER:
- Bruk /fill for store strukturer, lag for lag
- Tenk STORT – et lite hus er minst 15x15
- Alltid kreativ og full av detaljer!

Maks 90 tegn per chat-linje.`;
}

async function askGranat(userMessage, playerName) {
  try {
    chatHistory.push({ role: "user", parts: [{ text: `${playerName} sier: ${userMessage}` }] });
    const chat = model.startChat({ history: chatHistory.slice(0, -1), systemInstruction: buildSystemPrompt() });
    const result = await chat.sendMessage(`${playerName} sier: ${userMessage}`);
    const response = result.response.text();
    chatHistory.push({ role: "model", parts: [{ text: response }] });
    if (chatHistory.length > 30) chatHistory = chatHistory.slice(-30);
    return response;
  } catch (error) {
    console.error("Granat-feil:", error.message);
    return "Oi, jeg snublet litt! 😄 Prøv igjen – vi får det til!";
  }
}

async function parseAndExecute(response, client) {
  const lines = response.split("\n");
  const textLines = [];

  for (const t of lines.map(l => l.trim())) {
    if (!t) continue;
    if (t.startsWith("/MERK:")) {
      const name = t.replace("/MERK:", "").trim();
      memory.locations[name] = { ...memory.player_position };
      saveMemory(memory);
      textLines.push(`📍 Merket '${name}'!`);
    } else if (t.startsWith("/HUSK:")) {
      memory.builds.push({ note: t.replace("/HUSK:", "").trim(), pos: { ...memory.player_position }, time: new Date().toISOString() });
      saveMemory(memory);
    } else if (t.startsWith("/QUEST:")) {
      const parts = t.replace("/QUEST:", "").split(":");
      memory.quests.push({ name: parts[0], description: parts[1] || "", active: true });
      saveMemory(memory);
      textLines.push(`⚔️ Quest: ${parts[0]}!`);
    } else if (t.startsWith("/")) {
      await sleep(300);
      sendCommand(client, t);
    } else if (t.length > 0) {
      textLines.push(t);
    }
  }

  if (textLines.length > 0) {
    const chunks = splitIntoChunks(textLines.join(" "), 85);
    for (let i = 0; i < chunks.length; i++) {
      await sleep(i === 0 ? 300 : 600);
      sendChat(client, `💎 ${chunks[i]}`);
    }
  }
}

function handleShortcut(message, client) {
  const msg = message.toLowerCase().trim();

  if (msg === "!hjelp" || msg === "!help") {
    const lines = [
      "💎 Jeg er Granat – din byggemester og venn!",
      "! [melding] – snakk med meg",
      "!stil [middelalder/moderne/scifi/natur]",
      "!merk [navn] – lagre sted",
      "!gå [navn] – teleporter",
      "!gi [item] [antall] – få items",
      "!dag / !natt / !vær [type]",
      "!quest / !husk – quests og historikk",
      "!stats – statistikk",
    ];
    lines.forEach((l, i) => setTimeout(() => sendChat(client, l), i * 500));
    return true;
  }
  if (msg.startsWith("!stil ")) {
    const s = msg.slice(6).trim();
    if (STYLES[s]) { memory.currentStyle = s; saveMemory(memory); sendChat(client, `🎨 Stil: ${STYLES[s].desc}!`); }
    else sendChat(client, `Stiler: ${Object.keys(STYLES).join(", ")}`);
    return true;
  }
  if (msg.startsWith("!merk ")) {
    const name = message.slice(6).trim();
    memory.locations[name] = { ...memory.player_position };
    saveMemory(memory);
    sendChat(client, `📍 '${name}' lagret!`);
    return true;
  }
  if (msg.startsWith("!gå ") || msg.startsWith("!ga ")) {
    const name = message.slice(4).trim();
    const loc = memory.locations[name];
    if (loc) { sendCommand(client, `/tp @p ${loc.x} ${loc.y} ${loc.z}`); sendChat(client, `🚀 Til '${name}'!`); }
    else sendChat(client, `Kjenner ikke '${name}' 🗺️`);
    return true;
  }
  if (msg === "!quest") {
    const a = memory.quests.filter(q => q.active);
    if (!a.length) sendChat(client, "Ingen quests enda! ⚔️");
    else a.forEach((q, i) => setTimeout(() => sendChat(client, `⚔️ ${q.name}: ${q.description}`), i * 500));
    return true;
  }
  if (msg === "!husk") {
    const r = memory.builds.slice(-5);
    if (!r.length) sendChat(client, "Ingenting enda! 🏗️");
    else { sendChat(client, "🧱 Siste bygg:"); r.forEach((b, i) => setTimeout(() => sendChat(client, `  → ${b.note}`), (i+1)*500)); }
    return true;
  }
  if (msg === "!stats") {
    sendChat(client, `📊 Blokker: ${memory.stats.blocksPlaced || 0} | Sesjoner: ${memory.stats.totalSessions}`);
    return true;
  }
  if (msg === "!dag") { sendCommand(client, "/time set day"); sendChat(client, "☀️ God morgen!"); return true; }
  if (msg === "!natt") { sendCommand(client, "/time set night"); sendChat(client, "🌙 Natt! 😄"); return true; }
  if (msg.startsWith("!vær ") || msg.startsWith("!vaer ")) {
    const w = msg.includes("regn") ? "rain" : msg.includes("torden") ? "thunder" : "clear";
    sendCommand(client, `/weather ${w}`);
    sendChat(client, w === "clear" ? "☀️ Klart!" : w === "rain" ? "🌧️ Regn!" : "⛈️ Torden!");
    return true;
  }
  if (msg.startsWith("!gi ")) {
    const p = message.slice(4).trim().split(" ");
    sendCommand(client, `/give @p ${p[0]} ${p[1] || "64"}`);
    sendChat(client, `🎁 Her er ${p[1] || "64"}x ${p[0]}!`);
    return true;
  }
  return false;
}

function startServer() {
  console.log(`💎 Starter Granat-server på port ${PORT}...`);

  const server = bedrock.createServer({
    host: "0.0.0.0",
    port: PORT,
    version: "1.21.0",
    motd: { motd: "💎 Granats verden", levelName: "Granat" },
  });

  server.on("connect", (client) => {
    console.log(`✅ Spiller kobler til...`);

    client.on("join", () => {
      console.log(`🎮 ${client.username} er inne!`);
      setTimeout(() => {
        sendChat(client, `💎 Hei ${client.username}! Jeg er Granat – din byggemester!`);
        setTimeout(() => sendChat(client, "Skriv !hjelp for å se hva jeg kan! 🏗️"), 2000);
      }, 1000);
    });

    client.on("move_player", (packet) => {
      memory.player_position = {
        x: Math.round(packet.position.x),
        y: Math.round(packet.position.y),
        z: Math.round(packet.position.z),
      };
    });

    client.on("text", async (packet) => {
      const message = packet.message || "";
      if (!message.startsWith("!")) return;
      console.log(`💬 ${client.username}: ${message}`);
      if (handleShortcut(message, client)) return;
      const question = message.slice(1).trim();
      if (!question) return;
      sendChat(client, "💎 ...");
      const response = await askGranat(question, client.username);
      await parseAndExecute(response, client);
    });

    client.on("disconnect", () => console.log(`👋 ${client.username} logget av`));
  });

  server.on("error", (err) => console.error("❌ Serverfeil:", err.message));
  console.log(`✅ Granat-server kjører på port ${PORT}!`);
  console.log(`📱 Brage kobler til med serverens IP og port ${PORT}`);
}

function sendChat(client, message) {
  client.queue("text", { type: "chat", needs_translation: false, source_name: "Granat", xuid: "", platform_chat_id: "", message });
}
function sendCommand(client, command) {
  client.queue("command_request", { command, interval: false, origin: { type: "player", uuid: "", request_id: "" } });
}
function splitIntoChunks(text, maxLength) {
  const words = text.split(" "); const chunks = []; let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxLength) { if (current) chunks.push(current.trim()); current = word; }
    else current = (current + " " + word).trim();
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

startServer();
