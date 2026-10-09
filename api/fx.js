module.exports = async function handler(req, res) {
  const endpoint = "https://data-api.ecb.europa.eu/service/data/EXR/D.TRY+GBP+USD.EUR.SP00.A?lastNObservations=1&format=csvdata";
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=43200");
  res.setHeader("Access-Control-Allow-Origin", "*");

  function cells(line) {
    const out = [];
    let value = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) { value += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { out.push(value); value = ""; }
      else value += ch;
    }
    out.push(value);
    return out;
  }

  try {
    const response = await fetch(endpoint, { headers: { Accept: "text/csv" } });
    if (!response.ok) throw new Error("ECB returned " + response.status);
    const lines = (await response.text()).trim().split(/\r?\n/);
    const header = cells(lines.shift() || "");
    const currencyIndex = header.indexOf("CURRENCY");
    const valueIndex = header.indexOf("OBS_VALUE");
    const dateIndex = header.indexOf("TIME_PERIOD");
    if (currencyIndex < 0 || valueIndex < 0 || dateIndex < 0) throw new Error("Unexpected ECB response");

    const rates = { EUR: 1 };
    let asOf = "";
    for (const line of lines) {
      const row = cells(line);
      const currency = row[currencyIndex];
      const value = Number(row[valueIndex]);
      if (["TRY", "GBP", "USD"].includes(currency) && Number.isFinite(value)) rates[currency] = value;
      if (row[dateIndex] > asOf) asOf = row[dateIndex];
    }
    if (!["TRY", "GBP", "USD"].every(code => Number.isFinite(rates[code]))) throw new Error("Missing ECB rate");
    res.status(200).json({ base: "EUR", rates, asOf, source: "ECB reference rate" });
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "Exchange reference rates are temporarily unavailable." });
  }
};
