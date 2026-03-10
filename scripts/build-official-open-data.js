const fs = require('fs/promises');
const path = require('path');

const COUNTRIES = ['COL', 'GTM', 'ARG', 'PER', 'MEX', 'CHL'];

const INDICATORS = [
  {
    code: 'SH.H2O.BASW.ZS',
    indicatorCode: 'WATER',
    title: 'Acceso básico a agua potable',
    odsGoal: 'ODS 6',
    smithsonianGuide: 'Comunidades sostenibles',
    bloomLevel: 'Comprender',
    sourceLabel: 'World Bank Open Data'
  },
  {
    code: 'IT.NET.USER.ZS',
    indicatorCode: 'CONNECTIVITY',
    title: 'Uso de internet (% población)',
    odsGoal: 'ODS 9',
    smithsonianGuide: 'Comunidades sostenibles',
    bloomLevel: 'Aplicar',
    sourceLabel: 'World Bank Open Data'
  },
  {
    code: 'SH.STA.BASS.ZS',
    indicatorCode: 'WASTE',
    title: 'Acceso básico a saneamiento (proxy residuos)',
    odsGoal: 'ODS 6 / ODS 12',
    smithsonianGuide: 'Ecosistemas resilientes',
    bloomLevel: 'Analizar',
    sourceLabel: 'World Bank Open Data'
  },
  {
    code: 'EG.ELC.ACCS.ZS',
    indicatorCode: 'INFRASTRUCTURE',
    title: 'Acceso a electricidad (proxy infraestructura)',
    odsGoal: 'ODS 7 / ODS 9',
    smithsonianGuide: 'Comunidades sostenibles',
    bloomLevel: 'Evaluar',
    sourceLabel: 'World Bank Open Data'
  }
];

const CITY_ZONES = [
  { city: 'Ginebra', country: 'Colombia', iso3: 'COL', region: 'Valle del Cauca', community: 'Zona urbana y rural educativa', schoolName: 'Red escolar Ginebra', lat: 3.724, lng: -76.266 },
  { city: 'Ciudad de Guatemala', country: 'Guatemala', iso3: 'GTM', region: 'Guatemala', community: 'Área metropolitana', schoolName: 'Red escolar Guatemala', lat: 14.6349, lng: -90.5069 },
  { city: 'Posadas', country: 'Argentina', iso3: 'ARG', region: 'Misiones', community: 'Área urbana y periurbana', schoolName: 'Red escolar Posadas', lat: -27.424592, lng: -55.934723 },
  { city: 'Lima', country: 'Perú', iso3: 'PER', region: 'Lima Metropolitana', community: 'Conos y zona central', schoolName: 'Red escolar Lima', lat: -12.0464, lng: -77.0428 },
  { city: 'Ciudad de México', country: 'México', iso3: 'MEX', region: 'CDMX', community: 'Alcaldías prioritarias', schoolName: 'Red escolar CDMX', lat: 19.4326, lng: -99.1332 },
  { city: 'Santiago', country: 'Chile', iso3: 'CHL', region: 'Región Metropolitana', community: 'Comunas urbanas', schoolName: 'Red escolar Santiago', lat: -33.4489, lng: -70.6693 }
];

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}$/.test(String(dateStr))) return `${dateStr}-01-01`;
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

async function fetchWorldBankSeries(indicatorCode) {
  const url = `https://api.worldbank.org/v2/country/${COUNTRIES.join(';')}/indicator/${indicatorCode}?format=json&per_page=2000`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error consultando World Bank (${indicatorCode}): ${response.status}`);
  }
  const json = await response.json();
  return Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
}

function latestByCountry(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const iso = row?.countryiso3code;
    if (!iso || row?.value == null) return;
    const year = Number(row.date || 0);
    const current = grouped.get(iso);
    if (!current || year > current.year) {
      grouped.set(iso, { value: Number(row.value), year, country: row?.country?.value || iso });
    }
  });
  return grouped;
}

async function buildDataset() {
  const indicatorData = {};

  for (const indicator of INDICATORS) {
    const series = await fetchWorldBankSeries(indicator.code);
    indicatorData[indicator.code] = latestByCountry(series);
  }

  const records = [];

  CITY_ZONES.forEach((zone) => {
    INDICATORS.forEach((indicator) => {
      const wb = indicatorData[indicator.code]?.get(zone.iso3);
      if (!wb) return;

      const valueRounded = Number(wb.value.toFixed(2));
      const date = normalizeDate(String(wb.year));

      records.push({
        title: `${indicator.title} - ${zone.city}`,
        description: `Dato oficial de ${indicator.sourceLabel} para ${zone.country} aplicado al nodo educativo ${zone.city}.`,
        siteType: 'Nodo educativo territorial',
        category: 'OPEN_DATA',
        maslowLevel: 'Seguridad',
        bloomLevel: indicator.bloomLevel,
        country: zone.country,
        region: zone.region,
        city: zone.city,
        community: zone.community,
        schoolName: zone.schoolName,
        indicatorCode: indicator.indicatorCode,
        measurementDate: date,
        evidenceLevel: 'FUENTE_OFICIAL',
        sourceInstrument: `${indicator.sourceLabel} (${indicator.code})`,
        odsGoal: indicator.odsGoal,
        smithsonianGuide: indicator.smithsonianGuide,
        audience: ['ESTUDIANTE', 'DOCENTE', 'INVESTIGADOR', 'DOCENTE_EMBAJADOR_NESST'],
        color: indicator.indicatorCode === 'WATER'
          ? '#0EA5E9'
          : indicator.indicatorCode === 'CONNECTIVITY'
          ? '#8B5CF6'
          : indicator.indicatorCode === 'WASTE'
          ? '#F59E0B'
          : '#10B981',
        lat: zone.lat,
        lng: zone.lng,
        zipCode: '',
        projectName: 'Open Data LATAM Fase 1',
        sourceFormat: 'OPEN_API',
        createdBy: 'open-data-bot',
        createdAt: new Date().toISOString(),
        officialValue: valueRounded,
        officialUnit: '% población',
        officialYear: wb.year,
        sourceUrl: `https://api.worldbank.org/v2/country/${zone.iso3}/indicator/${indicator.code}?format=json`
      });
    });
  });

  return {
    datasetId: 'official-open-latam-fase1',
    title: 'Datos Oficiales LATAM — Fase 1',
    summary: 'Indicadores oficiales de agua, conectividad, saneamiento y electricidad para nodos de investigación LATAM.',
    generatedAt: new Date().toISOString(),
    sourceNotes: [
      {
        name: 'World Bank Open Data',
        url: 'https://data.worldbank.org/',
        indicators: INDICATORS.map((indicator) => `${indicator.code} (${indicator.indicatorCode})`)
      },
      {
        name: 'Smithsonian - For Educators',
        url: 'https://www.si.edu/educators',
        note: 'Referencia pedagógica para recursos educativos STEM y aprendizaje basado en evidencia.'
      }
    ],
    records,
    mapPoints: records
  };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const publicOut = path.join(root, 'public', 'data-open', 'official-open-latam.json');
  const dataOut = path.join(root, 'data', 'open-data', 'official-open-latam.json');

  const dataset = await buildDataset();
  await fs.writeFile(publicOut, JSON.stringify(dataset, null, 2), 'utf-8');
  await fs.writeFile(dataOut, JSON.stringify(dataset, null, 2), 'utf-8');

  console.log(`Archivo generado: ${publicOut}`);
  console.log(`Archivo generado: ${dataOut}`);
  console.log(`Registros generados: ${dataset.records.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
