export default async function handler(req, res) {
  const { word } = req.query;
  
  if (!word) {
    return res.status(400).json({ error: "No word provided" });
  }

  try {
    const response = await fetch(`https://latin-words.com/cgi-bin/translate.cgi?query=${word}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
      }
    });
    
    const data = await response.json();

    if (data.status !== "ok" || !data.message) {
      return res.status(404).json({ error: "Word not found in Whitaker" });
    }

    const rawText = data.message;
    const lines = rawText.split('\n');
    
    let dictLine = "";
    
    // שלב 1: מחפשים שורה "עשירה" שמכילה קבוצת נטייה בסוגריים עגולים וקוד בסוגריים מרובעים
    for (const line of lines) {
      if (line.includes('[') && line.includes(']') && line.includes('(') && line.includes(')')) {
         dictLine = line;
         break;
      }
    }

    // שלב 2: אם אין סוגריים עגולים, ניקח שורה עם סוגריים מרובעים, בתנאי שהיא לא שורת "X" סתמית
    if (!dictLine) {
      for (const line of lines) {
        if (line.includes('[') && line.includes(']') && !line.includes(' X ')) {
           dictLine = line;
           break;
        }
      }
    }

    // שלב 3: גיבוי אחרון - פשוט השורה הראשונה עם סוגריים מרובעים
    if (!dictLine) {
      for (const line of lines) {
        if (line.includes('[') && line.includes(']')) {
           dictLine = line;
           break;
        }
      }
    }

    if (!dictLine) {
       return res.status(404).json({ error: "Dictionary line not found" });
    }

    // חותכים את השורה לפי תבנית (צורה מילונית, חלק דיבר, נטייה, מין)
    const regex = /^(.+?)\s+([A-Z]+)(?:\s+\((.*?)\))?(?:\s+([A-Z]))?\s+\[/i;
    const match = dictLine.match(regex);

    if (!match) {
       return res.status(200).json({
         forms: dictLine.split('  ')[0], 
         raw: dictLine
       });
    }

    res.status(200).json({
      forms: match[1] ? match[1].trim() : null,         // למשל: Deus, Dei
      partOfSpeech: match[2] ? match[2].trim() : null,  // למשל: N
      declension: match[3] ? match[3].trim() : null,    // למשל: 2nd
      gender: match[4] ? match[4].trim() : null,        // למשל: M
      rawLine: dictLine
    });

  } catch (error) {
    console.error("Error fetching from Whitaker:", error);
    res.status(500).json({ error: "Failed to fetch data from server" });
  }
}