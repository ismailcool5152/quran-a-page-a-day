import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase
const firebaseConfig = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "firebase-applet-config.json"),
    "utf8",
  ),
);
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const PDF_FILE_ID = "1jkUnYmFGAfBEIfuI3TeP24hOmKHCsUDf";
const TEMP_PDF_PATH = path.join(process.cwd(), "quran.pdf");

async function downloadDriveFile(fileId: string, dest: string) {
  if (fs.existsSync(dest)) {
    console.log("PDF already exists. Skipping download.");
    return;
  }
  console.log("Downloading PDF from Google Drive...");
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;

  try {
    // 1. Initial request to get the confirm token & cookies
    const response = await axios.get(url, {
      responseType: "text",
      validateStatus: () => true,
    });
    let downloadUrl = url;
    let cookie = "";

    if (response.headers["set-cookie"]) {
      cookie = response.headers["set-cookie"].join("; ");
    }

    if (
      typeof response.data === "string" &&
      response.data.includes("confirm=")
    ) {
      const match = response.data.match(/confirm=([0-9A-Za-z_-]+)/);
      if (match) {
        const token = match[1];
        downloadUrl = `${url}&confirm=${token}`;
      }
    }

    // 2. Download the file stream
    const writer = fs.createWriteStream(dest);
    const downloadRes = await axios.get(downloadUrl, {
      responseType: "stream",
      headers: {
        Cookie: cookie,
      },
    });

    downloadRes.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log("PDF downloaded successfully.");
        resolve(true);
      });
      writer.on("error", (err: any) => {
        console.error("Error writing PDF:", err);
        reject(err);
      });
    });
  } catch (error) {
    console.error("Failed to download PDF:", error);
    throw error;
  }
}

async function extractPageBase64(
  pdfPath: string,
  pageNumber: number,
): Promise<string> {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const subDocument = await PDFDocument.create();

  // ensure pageNumber is valid. 0-indexed in pdf-lib.
  const pageIndex = Math.max(
    0,
    Math.min(pageNumber - 1, pdfDoc.getPageCount() - 1),
  );
  const [copiedPage] = await subDocument.copyPages(pdfDoc, [pageIndex]);
  subDocument.addPage(copiedPage);

  const subPdfBytes = await subDocument.save();
  return Buffer.from(subPdfBytes).toString("base64");
}

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint to get the current progress from cookie
app.get("/api/progress", (req, res) => {
  const day = req.cookies.imprint_quran_day;
  return res.json({ day: day ? parseInt(day, 10) : 1 });
});

// Endpoint to update the current progress in cookie
app.post("/api/progress", (req, res) => {
  const { day } = req.body;
  if (!day || isNaN(parseInt(day, 10))) {
    return res.status(400).json({ error: "Invalid day parameter" });
  }

  // Set cookie valid for 1 year
  res.cookie("imprint_quran_day", day.toString(), {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
  });

  res.json({ success: true, day: parseInt(day, 10) });
});

async function generateLessonData(day: number) {
  // Attempt to download the PDF if it doesn't exist
  await downloadDriveFile(PDF_FILE_ID, TEMP_PDF_PATH);

  // Some pages might be intro, let's say page = day + 3 (approximate to skip intro).
  const pageIndexToExtract = day + 3;

  console.log(`[Day ${day}] Extracting page ${pageIndexToExtract}...`);
  const base64Pdf = await extractPageBase64(TEMP_PDF_PATH, pageIndexToExtract);

  console.log(`[Day ${day}] Calling Gemini API...`);
  const prompt = `You are a profoundly knowledgeable Islamic scholar and teacher.
The attached PDF is a single page extracted from a specific layout Quran. 
The user wants bite-sized learning (like the app Imprint) for this specific daily page.

Carefully read all elements on this page, including the main Arabic text, its exact translation, and especially the side margins and bottom margins.

Extract and structure your findings EXACTLY according to these 5 points:
1. mainIdea: The core message and summary of the versers on this page.
2. rootWords: Identify a few distinct Arabic root words from the page. Provide their meaning and a brief grammatical point.
3. sideMargins: What do the side margins say about this page? Summarize the tafsir (exegesis) or context given there.
4. bottomMargins: What do the bottom margins say? Are there specific footnotes, cross-references, or rulings mentioned?
5. dailyLife: Based on the overall message of the page, generate practical, actionable advice on how this can be helpful in daily life. You can use your knowledge to synthesize this, but base it purely on the message of the page.

Your response MUST be exclusively valid JSON according to the schema provided. No markdown blocks outside JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash", // Flash has higher rate limits for processing large amounts of data
    contents: [
      { text: prompt },
      { inlineData: { data: base64Pdf, mimeType: "application/pdf" } },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mainIdea: {
            type: Type.STRING,
            description: "Main idea and summary of the page.",
          },
          rootWords: {
            type: Type.STRING,
            description:
              "Distinct Arabic root words, their meanings, and grammar points from this page.",
          },
          sideMargins: {
            type: Type.STRING,
            description:
              "Summary of what the side margins say about this page.",
          },
          bottomMargins: {
            type: Type.STRING,
            description:
              "Summary of what the bottom margins say about this page.",
          },
          dailyLife: {
            type: Type.STRING,
            description:
              "Actionable points on how this page's message can be helpful in daily life.",
          },
        },
        required: [
          "mainIdea",
          "rootWords",
          "sideMargins",
          "bottomMargins",
          "dailyLife",
        ],
      },
    },
  });

  const outputText = response.text;
  return JSON.parse(outputText);
}

// Background sync script to analyze 2 pages every day
async function syncNextPages() {
  try {
    const metaRef = doc(db, "metadata", "syncState");
    const metaDoc = await getDoc(metaRef);
    let lastAnalyzedDay = 0;
    if (metaDoc.exists() && metaDoc.data().lastAnalyzedDay) {
      lastAnalyzedDay = metaDoc.data().lastAnalyzedDay;
    }

    console.log(`[Background Sync] Starting sync. Last analyzed day: ${lastAnalyzedDay}`);

    for (let i = 1; i <= 2; i++) {
      const nextDay = lastAnalyzedDay + i;
      const lessonRef = doc(db, "lessons", nextDay.toString());
      const lessonDoc = await getDoc(lessonRef);

      if (!lessonDoc.exists()) {
        console.log(`[Background Sync] Generating content for day ${nextDay}...`);
        const lessonData = await generateLessonData(nextDay);
        await setDoc(lessonRef, lessonData);
        console.log(`[Background Sync] Successfully saved day ${nextDay} to Firestore.`);
      } else {
        console.log(`[Background Sync] Day ${nextDay} already exists.`);
      }

      await setDoc(metaRef, { lastAnalyzedDay: nextDay }, { merge: true });
    }
    console.log("[Background Sync] Sync complete.");
  } catch (error) {
    console.error("[Background Sync Error]:", error);
  }
}

app.get("/api/lesson/:day/pdf", async (req, res) => {
  try {
    const day = parseInt(req.params.day, 10);
    if (isNaN(day)) {
      return res.status(400).json({ error: "Invalid day parameter" });
    }

    // Attempt to download the PDF if it doesn't exist
    await downloadDriveFile(PDF_FILE_ID, TEMP_PDF_PATH);

    // Some pages might be intro, let's say page = day + 3.
    const pageIndexToExtract = day + 3;

    const base64Pdf = await extractPageBase64(TEMP_PDF_PATH, pageIndexToExtract);
    const pdfBuffer = Buffer.from(base64Pdf, "base64");

    res.contentType("application/pdf");
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error(`[PDF Service Error] ${error}`);
    res.status(500).json({ error: error.message || "Failed to load PDF." });
  }
});

app.get("/api/lesson/:day", async (req, res) => {
  try {
    const day = parseInt(req.params.day, 10);
    if (isNaN(day)) {
      return res.status(400).json({ error: "Invalid day parameter" });
    }

    // Check if lesson is cached in Firestore
    const lessonRef = doc(db, "lessons", day.toString());
    const lessonDoc = await getDoc(lessonRef);
    if (lessonDoc.exists()) {
      console.log(`Lesson for day ${day} fetched from Firestore cache.`);
      return res.json(lessonDoc.data());
    }

    // Generate new lesson data if not cached
    const lessonData = await generateLessonData(day);

    // Save to Firestore cache
    console.log(`Saving lesson for day ${day} to Firestore cache...`);
    await setDoc(lessonRef, lessonData);

    res.json(lessonData);
  } catch (error: any) {
    console.error("API Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to generate lesson." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Start background sync on server startup
    syncNextPages();
    
    // Then run it every 24 hours to automatically process 2 pages a day
    setInterval(syncNextPages, 24 * 60 * 60 * 1000);
  });
}

startServer();
