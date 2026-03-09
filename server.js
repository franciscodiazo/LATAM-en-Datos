const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const crypto = require('crypto');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'latam-datos-secret-dev';
const USE_MYSQL = process.env.USE_MYSQL === 'true' || process.env.NODE_ENV === 'production';
const DB_AUTO_CREATE = process.env.DB_AUTO_CREATE === 'true';
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const recordsFile = path.join(dataDir, 'records.json');
const projectsFile = path.join(dataDir, 'projects.json');
const openDataDir = path.join(dataDir, 'open-data');
const openDataFile = path.join(openDataDir, 'official-open-latam.json');
const coreDataDir = path.join(__dirname, 'public', 'data-core');
const coreProjectFiles = ['core-food.json', 'core-resiliencia-ecosistemica.json', 'core-capacidad-comunitaria.json'];
const frameworkFile = path.join(coreDataDir, 'propuesta-justificacion-ejemplo.json');
const actorsDataDir = path.join(__dirname, 'public', 'data-actores');
const actorFilesByRole = {
  ESTUDIANTE: 'actor-estudiantes.json',
  DOCENTE: 'actor-docentes.json',
  INVESTIGADOR: 'actor-investigadores.json'
};

const Roles = {
  ADMIN: 'ADMIN',
  AGENTE_AUTORIZADO: 'AGENTE_AUTORIZADO',
  INVESTIGADOR: 'INVESTIGADOR',
  DOCENTE_EMBAJADOR_NESST: 'DOCENTE_EMBAJADOR_NESST',
  DOCENTE: 'DOCENTE',
  ESTUDIANTE: 'ESTUDIANTE'
};

const ALL_ROLES = Object.values(Roles);

const API_CONSUMER_ROLES = [
  Roles.ADMIN,
  Roles.AGENTE_AUTORIZADO,
  Roles.INVESTIGADOR,
  Roles.DOCENTE_EMBAJADOR_NESST
];

const INDICATOR_CODES = ['WATER', 'WASTE', 'CONNECTIVITY', 'INFRASTRUCTURE', 'OTHER'];
const EVIDENCE_LEVELS = ['OBSERVACION', 'ENCUESTA', 'FUENTE_OFICIAL', 'MIXTA', 'NO_DEFINIDA'];

const upload = multer({ storage: multer.memoryStorage() });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const seedRecords = [
  {
    id: crypto.randomUUID(),
    title: 'Acceso a comedores escolares',
    description: 'Cobertura de alimentación en zonas vulnerables',
    siteType: 'Institución Educativa',
    category: 'MASLOW',
    maslowLevel: 'Fisiológicas',
    zipCode: '110111',
    odsGoal: 'ODS 2',
    smithsonianGuide: 'Alimentación',
    audience: ['ESTUDIANTE', 'DOCENTE', 'INVESTIGADOR'],
    color: '#16A34A',
    country: 'Colombia',
    region: 'Bogotá D.C.',
    city: 'Bogotá',
    community: 'Localidad Centro',
    schoolName: 'Colegio Distrital',
    indicatorCode: 'WATER',
    measurementDate: new Date().toISOString().slice(0, 10),
    evidenceLevel: 'ENCUESTA',
    sourceInstrument: 'Encuesta escolar',
    grade: '10',
    teamName: 'Semillero Agua',
    teacherName: 'Docente de Ciencias',
    lat: 4.711,
    lng: -74.0721,
    projectName: 'Nutrición Escolar Bogotá',
    sourceFormat: 'JSON',
    createdBy: 'admin',
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    title: 'Redes de apoyo comunitario',
    description: 'Puntos de encuentro para resiliencia comunitaria',
    siteType: 'Centro Comunitario',
    category: 'SMITHSONIAN',
    maslowLevel: 'Afiliación',
    zipCode: '050021',
    odsGoal: 'ODS 11',
    smithsonianGuide: 'Comunidades sostenibles',
    audience: ['DOCENTE_EMBAJADOR_NESST', 'INVESTIGADOR'],
    color: '#9333EA',
    country: 'Colombia',
    region: 'Antioquia',
    city: 'Medellín',
    community: 'Comuna 10',
    schoolName: 'Institución Educativa Centro',
    indicatorCode: 'WASTE',
    measurementDate: new Date().toISOString().slice(0, 10),
    evidenceLevel: 'OBSERVACION',
    sourceInstrument: 'Ficha de campo',
    grade: '9',
    teamName: 'Semillero Eco',
    teacherName: 'Docente líder',
    lat: 6.2442,
    lng: -75.5812,
    projectName: 'Barrios Resilientes Medellín',
    sourceFormat: 'JSON',
    createdBy: 'admin',
    createdAt: new Date().toISOString()
  }
];

const seedProjects = [
  {
    id: 'p-1',
    title: 'Modelo de alerta territorial educativa',
    summary: 'Uso de API de LATAM en Datos para priorizar intervención estudiantil.',
    owner: 'Equipo de Investigación Territorial',
    createdAt: new Date().toISOString(),
    source: 'API /api/data + /api/map/points'
  },
  {
    id: 'p-2',
    title: 'Análisis comparado de necesidades Maslow por región',
    summary: 'Cruce de niveles de Maslow con variables ODS.',
    owner: 'Red de Docentes Embajadores NESST',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    source: 'Exportación GeoJSON'
  }
];

const seedOpenData = {
  datasetId: 'official-open-latam-fase1',
  title: 'Datos Oficiales LATAM — Fase 1',
  summary: 'Repositorio de datos oficiales para análisis comparativo en nodos territoriales LATAM.',
  generatedAt: new Date().toISOString(),
  sourceNotes: [],
  records: [],
  mapPoints: []
};

let store;

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt
  };
}

async function ensureFile(filePath, fallbackData) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(fallbackData, null, 2), 'utf-8');
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function normalizeCoreProjectPayload(payload) {
  return {
    projectId: String(payload?.projectId || '').trim(),
    title: String(payload?.title || '').trim(),
    summary: String(payload?.summary || '').trim(),
    focusOds: Array.isArray(payload?.focusOds) ? payload.focusOds.map((item) => String(item).trim()).filter(Boolean) : [],
    records: Array.isArray(payload?.records)
      ? payload.records.map((record) => ({
          indicator: record?.indicator || '',
          meta: record?.meta || '',
          ods: record?.ods || '',
          tipoDato: record?.tipoDato || '',
          instrumento: record?.instrumento || '',
          valorEjemplo: record?.valorEjemplo ?? null,
          unidad: record?.unidad || '',
          territorio: record?.territorio || ''
        }))
      : [],
    mapPoints: Array.isArray(payload?.mapPoints)
      ? payload.mapPoints.map((point) => ({
          title: point?.title || '',
          description: point?.description || '',
          siteType: point?.siteType || '',
          category: point?.category || '',
          maslowLevel: point?.maslowLevel || '',
          zipCode: point?.zipCode || '',
          odsGoal: point?.odsGoal || '',
          smithsonianGuide: point?.smithsonianGuide || '',
          audience: Array.isArray(point?.audience) ? point.audience : [],
          color: point?.color || '#2563EB',
          lat: Number.isFinite(Number(point?.lat)) ? Number(point.lat) : 0,
          lng: Number.isFinite(Number(point?.lng)) ? Number(point.lng) : 0,
          projectName: point?.projectName || '',
          cityName: point?.cityName || ''
        }))
      : []
  };
}

async function readCoreProjectsFromFiles() {
  const payloads = await Promise.all(
    coreProjectFiles.map(async (fileName) => {
      const fullPath = path.join(coreDataDir, fileName);
      const payload = await readJson(fullPath);
      return normalizeCoreProjectPayload(payload);
    })
  );

  return payloads.filter((project) => project.projectId);
}

function normalizeActorPayload(payload) {
  return {
    actor: String(payload?.actor || '').trim(),
    title: String(payload?.title || '').trim(),
    items: Array.isArray(payload?.items)
      ? payload.items.map((item) => ({
          tema: item?.tema || '',
          accion: item?.accion || '',
          indicador: item?.indicador || '',
          ods: item?.ods || '',
          instrumento: item?.instrumento || ''
        }))
      : []
  };
}

async function readActorsFromFiles() {
  const entries = Object.entries(actorFilesByRole);
  const payloads = await Promise.all(
    entries.map(async ([role, fileName]) => {
      const payload = await readJson(path.join(actorsDataDir, fileName));
      const normalized = normalizeActorPayload(payload);
      if (!normalized.actor) {
        normalized.actor = role;
      }
      return normalized;
    })
  );

  return payloads.filter((payload) => payload.actor);
}

function normalizeFrameworkPayload(payload) {
  const justificacion = payload?.justificacion || {};
  const matriz = payload?.matrizIndicadores || {};

  const normalizedBlocks = Object.entries(matriz).reduce((acc, [blockName, rows]) => {
    if (!Array.isArray(rows)) {
      acc[blockName] = [];
      return acc;
    }
    acc[blockName] = rows.map((item) => ({
      indicador: item?.indicador || '',
      ods: item?.ods || '',
      meta: item?.meta || '',
      tipoDato: item?.tipoDato || '',
      instrumento: item?.instrumento || ''
    }));
    return acc;
  }, {});

  return {
    project: String(payload?.project || 'LATAM EN DATOS').trim(),
    justificacion: {
      odsAlineados: Array.isArray(justificacion?.odsAlineados) ? justificacion.odsAlineados.map((item) => String(item).trim()).filter(Boolean) : [],
      metasPriorizadas: Array.isArray(justificacion?.metasPriorizadas)
        ? justificacion.metasPriorizadas.map((item) => String(item).trim()).filter(Boolean)
        : [],
      enfoque: String(justificacion?.enfoque || '').trim()
    },
    matrizIndicadores: normalizedBlocks
  };
}

async function readFrameworkFromFile() {
  const payload = await readJson(frameworkFile);
  return normalizeFrameworkPayload(payload);
}

class JsonStore {
  async init() {
    const passwordHash = await bcrypt.hash('Latam2026*', 10);

    await ensureFile(usersFile, [
      {
        id: 'u-admin',
        username: 'admin',
        fullName: 'Administrador LATAM',
        role: Roles.ADMIN,
        passwordHash,
        createdAt: new Date().toISOString()
      },
      {
        id: 'u-agente',
        username: 'agente',
        fullName: 'Agente Autorizado',
        role: Roles.AGENTE_AUTORIZADO,
        passwordHash,
        createdAt: new Date().toISOString()
      },
      {
        id: 'u-nesst',
        username: 'nesst',
        fullName: 'Docente Embajador NESST',
        role: Roles.DOCENTE_EMBAJADOR_NESST,
        passwordHash,
        createdAt: new Date().toISOString()
      },
      {
        id: 'u-invest',
        username: 'investigador',
        fullName: 'Investigador Grupo Focal',
        role: Roles.INVESTIGADOR,
        passwordHash,
        createdAt: new Date().toISOString()
      },
      {
        id: 'u-docente',
        username: 'docente',
        fullName: 'Docente General',
        role: Roles.DOCENTE,
        passwordHash,
        createdAt: new Date().toISOString()
      },
      {
        id: 'u-estudiante',
        username: 'estudiante',
        fullName: 'Estudiante',
        role: Roles.ESTUDIANTE,
        passwordHash,
        createdAt: new Date().toISOString()
      }
    ]);
    await ensureFile(recordsFile, seedRecords);
    await ensureFile(projectsFile, seedProjects);
  }

  async getUsers() {
    return readJson(usersFile);
  }

  async getUserById(id) {
    const users = await this.getUsers();
    return users.find((user) => user.id === id);
  }

  async getUserByUsername(username) {
    const users = await this.getUsers();
    return users.find((user) => user.username === username);
  }

  async listUsersPublic() {
    const users = await this.getUsers();
    return users.map(toPublicUser);
  }

  async createUser({ username, fullName, role, passwordHash }) {
    const users = await this.getUsers();
    const user = {
      id: crypto.randomUUID(),
      username,
      fullName,
      role,
      passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await writeJson(usersFile, users);
    return toPublicUser(user);
  }

  async updateUser(id, { fullName, role }) {
    const users = await this.getUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index < 0) {
      return null;
    }
    users[index].fullName = fullName;
    users[index].role = role;
    await writeJson(usersFile, users);
    return toPublicUser(users[index]);
  }

  async updatePassword(id, passwordHash) {
    const users = await this.getUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index < 0) {
      return false;
    }
    users[index].passwordHash = passwordHash;
    await writeJson(usersFile, users);
    return true;
  }

  async deleteUser(id) {
    const users = await this.getUsers();
    const initialLength = users.length;
    const filtered = users.filter((user) => user.id !== id);
    if (filtered.length === initialLength) {
      return false;
    }
    await writeJson(usersFile, filtered);
    return true;
  }

  async getRecords() {
    return readJson(recordsFile);
  }

  async addRecords(records) {
    const current = await this.getRecords();
    current.push(...records);
    await writeJson(recordsFile, current);
  }

  async getProjects() {
    return readJson(projectsFile);
  }

  async getOpenDataPayload() {
    return readOpenDataStore();
  }

  async addOpenDataRecords({ records, title, summary, sourceNotes }) {
    const payload = await this.getOpenDataPayload();
    const merged = [...payload.records, ...records];
    const nextPayload = {
      ...payload,
      title: title || payload.title,
      summary: summary || payload.summary,
      sourceNotes: Array.isArray(sourceNotes) ? sourceNotes : payload.sourceNotes,
      generatedAt: new Date().toISOString(),
      records: merged,
      mapPoints: merged.map((record) => toOpenDataPoint(record))
    };
    await writeOpenDataStore(nextPayload);
    return { total: nextPayload.records.length };
  }

  async getCoreProjects() {
    return readCoreProjectsFromFiles();
  }

  async getCoreProjectById(projectId) {
    const projects = await this.getCoreProjects();
    return projects.find((project) => project.projectId === projectId) || null;
  }

  async getActors() {
    return readActorsFromFiles();
  }

  async getActorByRole(role) {
    const actors = await this.getActors();
    return actors.find((actor) => String(actor.actor).toUpperCase() === String(role).toUpperCase()) || null;
  }

  async getFramework() {
    return readFrameworkFromFile();
  }

  async getStorageType() {
    return 'json';
  }
}

class MySqlStore {
  constructor() {
    this.connectionConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'latam_en_datos',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
    this.pool = null;
  }

  async init() {
    if (DB_AUTO_CREATE) {
      const bootstrap = await mysql.createConnection({
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password
      });
      await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${this.connectionConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await bootstrap.end();
    }

    this.pool = mysql.createPool(this.connectionConfig);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(80) NOT NULL UNIQUE,
        full_name VARCHAR(160) NOT NULL,
        role VARCHAR(60) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS records (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        site_type VARCHAR(150),
        country VARCHAR(80),
        region VARCHAR(120),
        city VARCHAR(120),
        community VARCHAR(150),
        school_name VARCHAR(180),
        indicator_code VARCHAR(40),
        measurement_date DATE,
        evidence_level VARCHAR(40),
        source_instrument VARCHAR(180),
        grade VARCHAR(40),
        team_name VARCHAR(120),
        teacher_name VARCHAR(160),
        category VARCHAR(80) NOT NULL,
        maslow_level VARCHAR(120) NOT NULL,
        zip_code VARCHAR(20),
        ods_goal VARCHAR(60),
        smithsonian_guide VARCHAR(120),
        audience JSON,
        color VARCHAR(20),
        lat DOUBLE,
        lng DOUBLE,
        project_name VARCHAR(180),
        source_format VARCHAR(20),
        created_by VARCHAR(80),
        created_at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN site_type VARCHAR(150) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN zip_code VARCHAR(20) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN country VARCHAR(80) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN region VARCHAR(120) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN city VARCHAR(120) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN community VARCHAR(150) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN school_name VARCHAR(180) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN indicator_code VARCHAR(40) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN measurement_date DATE NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN evidence_level VARCHAR(40) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN source_instrument VARCHAR(180) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN grade VARCHAR(40) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN team_name VARCHAR(120) NULL');
    } catch {}
    try {
      await this.pool.execute('ALTER TABLE records ADD COLUMN teacher_name VARCHAR(160) NULL');
    } catch {}

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(220) NOT NULL,
        summary TEXT,
        owner VARCHAR(180),
        created_at DATETIME NOT NULL,
        source VARCHAR(220)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS open_datasets (
        dataset_id VARCHAR(120) PRIMARY KEY,
        title VARCHAR(220) NOT NULL,
        summary TEXT,
        generated_at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS open_source_notes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        dataset_id VARCHAR(120) NOT NULL,
        name VARCHAR(180) NOT NULL,
        url VARCHAR(400),
        note TEXT,
        indicators JSON,
        FOREIGN KEY (dataset_id) REFERENCES open_datasets(dataset_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS open_records (
        id VARCHAR(36) PRIMARY KEY,
        dataset_id VARCHAR(120) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        site_type VARCHAR(150),
        country VARCHAR(80),
        region VARCHAR(120),
        city VARCHAR(120),
        community VARCHAR(150),
        school_name VARCHAR(180),
        indicator_code VARCHAR(40),
        measurement_date DATE,
        evidence_level VARCHAR(40),
        source_instrument VARCHAR(220),
        category VARCHAR(80),
        maslow_level VARCHAR(120),
        bloom_level VARCHAR(80),
        smithsonian_guide VARCHAR(120),
        audience JSON,
        color VARCHAR(20),
        lat DOUBLE,
        lng DOUBLE,
        project_name VARCHAR(180),
        source_format VARCHAR(20),
        created_by VARCHAR(80),
        created_at DATETIME NOT NULL,
        official_value DOUBLE,
        official_unit VARCHAR(80),
        official_year INT,
        source_url VARCHAR(500),
        FOREIGN KEY (dataset_id) REFERENCES open_datasets(dataset_id) ON DELETE CASCADE,
        INDEX idx_open_records_context (country, city, indicator_code, official_year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS core_projects (
        project_id VARCHAR(120) PRIMARY KEY,
        title VARCHAR(220) NOT NULL,
        summary TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS core_focus_ods (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        project_id VARCHAR(120) NOT NULL,
        ods VARCHAR(80) NOT NULL,
        FOREIGN KEY (project_id) REFERENCES core_projects(project_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS core_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        project_id VARCHAR(120) NOT NULL,
        indicator VARCHAR(240),
        meta VARCHAR(120),
        ods VARCHAR(120),
        tipo_dato VARCHAR(120),
        instrumento VARCHAR(240),
        valor_ejemplo JSON,
        unidad VARCHAR(180),
        territorio VARCHAR(180),
        FOREIGN KEY (project_id) REFERENCES core_projects(project_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS core_map_points (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        project_id VARCHAR(120) NOT NULL,
        title VARCHAR(220),
        description TEXT,
        site_type VARCHAR(150),
        category VARCHAR(80),
        maslow_level VARCHAR(120),
        zip_code VARCHAR(20),
        ods_goal VARCHAR(100),
        smithsonian_guide VARCHAR(120),
        audience JSON,
        color VARCHAR(20),
        lat DOUBLE,
        lng DOUBLE,
        project_name VARCHAR(180),
        city_name VARCHAR(120),
        FOREIGN KEY (project_id) REFERENCES core_projects(project_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS actors (
        actor_code VARCHAR(80) PRIMARY KEY,
        title VARCHAR(140) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS actor_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        actor_code VARCHAR(80) NOT NULL,
        tema VARCHAR(220),
        accion TEXT,
        indicador VARCHAR(220),
        ods VARCHAR(120),
        instrumento VARCHAR(220),
        FOREIGN KEY (actor_code) REFERENCES actors(actor_code) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS framework_projects (
        project_key VARCHAR(120) PRIMARY KEY,
        project_name VARCHAR(180) NOT NULL,
        enfoque TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS framework_ods (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        project_key VARCHAR(120) NOT NULL,
        ods VARCHAR(80) NOT NULL,
        FOREIGN KEY (project_key) REFERENCES framework_projects(project_key) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS framework_metas (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        project_key VARCHAR(120) NOT NULL,
        meta VARCHAR(80) NOT NULL,
        FOREIGN KEY (project_key) REFERENCES framework_projects(project_key) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS framework_indicators (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        project_key VARCHAR(120) NOT NULL,
        block_name VARCHAR(120) NOT NULL,
        order_index INT NOT NULL,
        indicador VARCHAR(280),
        ods VARCHAR(120),
        meta VARCHAR(120),
        tipo_dato VARCHAR(120),
        instrumento VARCHAR(240),
        FOREIGN KEY (project_key) REFERENCES framework_projects(project_key) ON DELETE CASCADE,
        INDEX idx_framework_block (project_key, block_name, order_index)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [[userCount]] = await this.pool.query('SELECT COUNT(*) AS count FROM users');
    if (Number(userCount.count) === 0) {
      const passwordHash = await bcrypt.hash('Latam2026*', 10);
      const users = [
        { id: 'u-admin', username: 'admin', fullName: 'Administrador LATAM', role: Roles.ADMIN, passwordHash },
        { id: 'u-agente', username: 'agente', fullName: 'Agente Autorizado', role: Roles.AGENTE_AUTORIZADO, passwordHash },
        { id: 'u-nesst', username: 'nesst', fullName: 'Docente Embajador NESST', role: Roles.DOCENTE_EMBAJADOR_NESST, passwordHash },
        { id: 'u-invest', username: 'investigador', fullName: 'Investigador Grupo Focal', role: Roles.INVESTIGADOR, passwordHash },
        { id: 'u-docente', username: 'docente', fullName: 'Docente General', role: Roles.DOCENTE, passwordHash },
        { id: 'u-estudiante', username: 'estudiante', fullName: 'Estudiante', role: Roles.ESTUDIANTE, passwordHash }
      ];

      for (const user of users) {
        await this.pool.execute(
          'INSERT INTO users (id, username, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)',
          [user.id, user.username, user.fullName, user.role, user.passwordHash]
        );
      }
    }

    const [[recordCount]] = await this.pool.query('SELECT COUNT(*) AS count FROM records');
    if (Number(recordCount.count) === 0) {
      await this.addRecords(seedRecords);
    }

    const [[projectCount]] = await this.pool.query('SELECT COUNT(*) AS count FROM projects');
    if (Number(projectCount.count) === 0) {
      for (const project of seedProjects) {
        await this.pool.execute(
          'INSERT INTO projects (id, title, summary, owner, created_at, source) VALUES (?, ?, ?, ?, ?, ?)',
          [project.id, project.title, project.summary, project.owner, project.createdAt, project.source]
        );
      }
    }

    await this.seedOpenDataIfEmpty();
    await this.seedCoreProjectsIfEmpty();
    await this.seedActorsIfEmpty();
    await this.seedFrameworkIfEmpty();
  }

  async getUsers() {
    const [rows] = await this.pool.query(
      'SELECT id, username, full_name AS fullName, role, password_hash AS passwordHash, created_at AS createdAt FROM users ORDER BY created_at DESC'
    );
    return rows;
  }

  async getUserById(id) {
    const [rows] = await this.pool.execute(
      'SELECT id, username, full_name AS fullName, role, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0];
  }

  async getUserByUsername(username) {
    const [rows] = await this.pool.execute(
      'SELECT id, username, full_name AS fullName, role, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    return rows[0];
  }

  async listUsersPublic() {
    const users = await this.getUsers();
    return users.map(toPublicUser);
  }

  async createUser({ username, fullName, role, passwordHash }) {
    const id = crypto.randomUUID();
    await this.pool.execute(
      'INSERT INTO users (id, username, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)',
      [id, username, fullName, role, passwordHash]
    );
    const created = await this.getUserById(id);
    return toPublicUser(created);
  }

  async updateUser(id, { fullName, role }) {
    const [result] = await this.pool.execute('UPDATE users SET full_name = ?, role = ? WHERE id = ?', [fullName, role, id]);
    if (result.affectedRows < 1) {
      return null;
    }
    const user = await this.getUserById(id);
    return toPublicUser(user);
  }

  async updatePassword(id, passwordHash) {
    const [result] = await this.pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
    return result.affectedRows > 0;
  }

  async deleteUser(id) {
    const [result] = await this.pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  normalizeRecordRow(row) {
    let audience = row.audience;
    if (typeof audience === 'string') {
      try {
        audience = JSON.parse(audience);
      } catch {
        audience = [];
      }
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      siteType: row.siteType || '',
      country: row.country || '',
      region: row.region || '',
      city: row.city || '',
      community: row.community || '',
      schoolName: row.schoolName || '',
      indicatorCode: row.indicatorCode || 'OTHER',
      measurementDate: row.measurementDate || '',
      evidenceLevel: row.evidenceLevel || 'NO_DEFINIDA',
      sourceInstrument: row.sourceInstrument || '',
      grade: row.grade || '',
      teamName: row.teamName || '',
      teacherName: row.teacherName || '',
      category: row.category,
      maslowLevel: row.maslowLevel,
      zipCode: row.zipCode || '',
      odsGoal: row.odsGoal || '',
      smithsonianGuide: row.smithsonianGuide || '',
      audience: Array.isArray(audience) ? audience : [],
      color: row.color || '#2563EB',
      lat: Number(row.lat || 0),
      lng: Number(row.lng || 0),
      projectName: row.projectName || '',
      sourceFormat: row.sourceFormat || 'JSON',
      createdBy: row.createdBy || 'system',
      createdAt: row.createdAt
    };
  }

  async getRecords() {
    const [rows] = await this.pool.query(
          `SELECT id, title, description, site_type AS siteType, country, region, city, community, school_name AS schoolName,
            indicator_code AS indicatorCode, measurement_date AS measurementDate, evidence_level AS evidenceLevel,
            source_instrument AS sourceInstrument, grade, team_name AS teamName, teacher_name AS teacherName,
            category, maslow_level AS maslowLevel, zip_code AS zipCode, ods_goal AS odsGoal,
              smithsonian_guide AS smithsonianGuide, audience, color, lat, lng, project_name AS projectName,
              source_format AS sourceFormat, created_by AS createdBy, created_at AS createdAt
       FROM records ORDER BY created_at DESC`
    );
    return rows.map((row) => this.normalizeRecordRow(row));
  }

  async addRecords(records) {
    for (const record of records) {
      await this.pool.execute(
        `INSERT INTO records (
          id, title, description, site_type, country, region, city, community, school_name,
          indicator_code, measurement_date, evidence_level, source_instrument, grade, team_name, teacher_name,
          category, maslow_level, zip_code, ods_goal, smithsonian_guide,
          audience, color, lat, lng, project_name, source_format, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          record.id,
          record.title,
          record.description,
          record.siteType,
          record.country,
          record.region,
          record.city,
          record.community,
          record.schoolName,
          record.indicatorCode,
          record.measurementDate || null,
          record.evidenceLevel,
          record.sourceInstrument,
          record.grade,
          record.teamName,
          record.teacherName,
          record.category,
          record.maslowLevel,
          record.zipCode,
          record.odsGoal,
          record.smithsonianGuide,
          JSON.stringify(record.audience || []),
          record.color,
          record.lat,
          record.lng,
          record.projectName,
          record.sourceFormat,
          record.createdBy,
          record.createdAt
        ]
      );
    }
  }

  async getProjects() {
    const [rows] = await this.pool.query(
      'SELECT id, title, summary, owner, created_at AS createdAt, source FROM projects ORDER BY created_at DESC'
    );
    return rows;
  }

  normalizeOpenDataRow(row) {
    const base = this.normalizeRecordRow({
      ...row,
      measurementDate: row.measurementDate,
      createdAt: row.createdAt
    });
    return {
      ...base,
      bloomLevel: row.bloomLevel || 'Analizar',
      officialValue: Number.isFinite(Number(row.officialValue)) ? Number(row.officialValue) : null,
      officialUnit: row.officialUnit || '',
      officialYear: Number.isFinite(Number(row.officialYear)) ? Number(row.officialYear) : null,
      sourceUrl: row.sourceUrl || ''
    };
  }

  async getOpenDataPayload() {
    const [datasetRows] = await this.pool.query(
      'SELECT dataset_id AS datasetId, title, summary, generated_at AS generatedAt FROM open_datasets ORDER BY generated_at DESC LIMIT 1'
    );
    const dataset = datasetRows[0] || {
      datasetId: seedOpenData.datasetId,
      title: seedOpenData.title,
      summary: seedOpenData.summary,
      generatedAt: new Date().toISOString()
    };

    const [sourceRows] = await this.pool.execute(
      'SELECT name, url, note, indicators FROM open_source_notes WHERE dataset_id = ? ORDER BY id ASC',
      [dataset.datasetId]
    );

    const sourceNotes = sourceRows.map((row) => {
      let indicators = row.indicators;
      if (typeof indicators === 'string') {
        try {
          indicators = JSON.parse(indicators);
        } catch {
          indicators = [];
        }
      }
      return {
        name: row.name,
        url: row.url || '',
        note: row.note || '',
        indicators: Array.isArray(indicators) ? indicators : []
      };
    });

    const [recordRows] = await this.pool.execute(
      `SELECT id, title, description, site_type AS siteType, country, region, city, community, school_name AS schoolName,
              indicator_code AS indicatorCode, measurement_date AS measurementDate, evidence_level AS evidenceLevel,
              source_instrument AS sourceInstrument, category, maslow_level AS maslowLevel, bloom_level AS bloomLevel,
              smithsonian_guide AS smithsonianGuide, audience, color, lat, lng, project_name AS projectName,
              source_format AS sourceFormat, created_by AS createdBy, created_at AS createdAt,
              official_value AS officialValue, official_unit AS officialUnit, official_year AS officialYear, source_url AS sourceUrl
       FROM open_records WHERE dataset_id = ? ORDER BY created_at DESC`,
      [dataset.datasetId]
    );

    const records = recordRows.map((row) => this.normalizeOpenDataRow(row));

    return {
      datasetId: dataset.datasetId,
      title: dataset.title,
      summary: dataset.summary,
      generatedAt: dataset.generatedAt,
      sourceNotes,
      records,
      mapPoints: records.map((record) => toOpenDataPoint(record))
    };
  }

  async addOpenDataRecords({ records, title, summary, sourceNotes }) {
    const existing = await this.getOpenDataPayload();
    const datasetId = existing.datasetId || seedOpenData.datasetId;
    const generatedAt = new Date().toISOString();

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO open_datasets (dataset_id, title, summary, generated_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), generated_at = VALUES(generated_at)`,
        [datasetId, title || existing.title, summary || existing.summary, generatedAt]
      );

      if (Array.isArray(sourceNotes)) {
        await connection.execute('DELETE FROM open_source_notes WHERE dataset_id = ?', [datasetId]);
        for (const note of sourceNotes) {
          await connection.execute(
            'INSERT INTO open_source_notes (dataset_id, name, url, note, indicators) VALUES (?, ?, ?, ?, ?)',
            [datasetId, note?.name || 'Fuente', note?.url || '', note?.note || '', JSON.stringify(Array.isArray(note?.indicators) ? note.indicators : [])]
          );
        }
      }

      for (const record of records) {
        await connection.execute(
          `INSERT INTO open_records (
            id, dataset_id, title, description, site_type, country, region, city, community, school_name,
            indicator_code, measurement_date, evidence_level, source_instrument, category, maslow_level,
            bloom_level, smithsonian_guide, audience, color, lat, lng, project_name, source_format,
            created_by, created_at, official_value, official_unit, official_year, source_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
          [
            record.id,
            datasetId,
            record.title,
            record.description,
            record.siteType,
            record.country,
            record.region,
            record.city,
            record.community,
            record.schoolName,
            record.indicatorCode,
            record.measurementDate || null,
            record.evidenceLevel,
            record.sourceInstrument,
            record.category,
            record.maslowLevel,
            record.bloomLevel || 'Analizar',
            record.smithsonianGuide,
            JSON.stringify(record.audience || []),
            record.color,
            record.lat,
            record.lng,
            record.projectName,
            record.sourceFormat,
            record.createdBy,
            record.createdAt,
            Number.isFinite(Number(record.officialValue)) ? Number(record.officialValue) : null,
            record.officialUnit || '',
            Number.isFinite(Number(record.officialYear)) ? Number(record.officialYear) : null,
            record.sourceUrl || ''
          ]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [[countResult]] = await this.pool.execute('SELECT COUNT(*) AS total FROM open_records WHERE dataset_id = ?', [datasetId]);
    return { total: Number(countResult.total || 0) };
  }

  async seedOpenDataIfEmpty() {
    const [[openDataCount]] = await this.pool.query('SELECT COUNT(*) AS count FROM open_records');
    if (Number(openDataCount.count) > 0) {
      return;
    }

    const payload = await readOpenDataStore();
    const normalizedRecords = (Array.isArray(payload.records) ? payload.records : []).map((item) => {
      const normalized = normalizeOpenDataRecord(item, { username: item?.createdBy || 'open-data-bot' });
      if (item?.id) {
        normalized.id = String(item.id);
      }
      return normalized;
    });

    await this.addOpenDataRecords({
      records: normalizedRecords,
      title: payload.title,
      summary: payload.summary,
      sourceNotes: payload.sourceNotes
    });
  }

  async getCoreProjects() {
    const [projectRows] = await this.pool.query(
      'SELECT project_id AS projectId, title, summary FROM core_projects ORDER BY project_id ASC'
    );

    const projects = [];
    for (const project of projectRows) {
      const [odsRows] = await this.pool.execute(
        'SELECT ods FROM core_focus_ods WHERE project_id = ? ORDER BY id ASC',
        [project.projectId]
      );
      const [recordRows] = await this.pool.execute(
        `SELECT indicator, meta, ods, tipo_dato AS tipoDato, instrumento, valor_ejemplo AS valorEjemplo, unidad, territorio
         FROM core_records WHERE project_id = ? ORDER BY id ASC`,
        [project.projectId]
      );
      const [pointRows] = await this.pool.execute(
        `SELECT title, description, site_type AS siteType, category, maslow_level AS maslowLevel,
                zip_code AS zipCode, ods_goal AS odsGoal, smithsonian_guide AS smithsonianGuide,
                audience, color, lat, lng, project_name AS projectName, city_name AS cityName
         FROM core_map_points WHERE project_id = ? ORDER BY id ASC`,
        [project.projectId]
      );

      const records = recordRows.map((row) => {
        let valorEjemplo = row.valorEjemplo;
        if (typeof valorEjemplo === 'string') {
          try {
            valorEjemplo = JSON.parse(valorEjemplo);
          } catch {}
        }
        return {
          indicator: row.indicator || '',
          meta: row.meta || '',
          ods: row.ods || '',
          tipoDato: row.tipoDato || '',
          instrumento: row.instrumento || '',
          valorEjemplo: valorEjemplo ?? null,
          unidad: row.unidad || '',
          territorio: row.territorio || ''
        };
      });

      const mapPoints = pointRows.map((row) => {
        let audience = row.audience;
        if (typeof audience === 'string') {
          try {
            audience = JSON.parse(audience);
          } catch {
            audience = [];
          }
        }

        return {
          title: row.title || '',
          description: row.description || '',
          siteType: row.siteType || '',
          category: row.category || '',
          maslowLevel: row.maslowLevel || '',
          zipCode: row.zipCode || '',
          odsGoal: row.odsGoal || '',
          smithsonianGuide: row.smithsonianGuide || '',
          audience: Array.isArray(audience) ? audience : [],
          color: row.color || '#2563EB',
          lat: Number(row.lat || 0),
          lng: Number(row.lng || 0),
          projectName: row.projectName || '',
          cityName: row.cityName || ''
        };
      });

      projects.push({
        projectId: project.projectId,
        title: project.title,
        summary: project.summary || '',
        focusOds: odsRows.map((row) => row.ods),
        records,
        mapPoints
      });
    }

    return projects;
  }

  async getCoreProjectById(projectId) {
    const projects = await this.getCoreProjects();
    return projects.find((project) => project.projectId === projectId) || null;
  }

  async seedCoreProjectsIfEmpty() {
    const [[coreCount]] = await this.pool.query('SELECT COUNT(*) AS count FROM core_projects');
    if (Number(coreCount.count) > 0) {
      return;
    }

    const projects = await readCoreProjectsFromFiles();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const project of projects) {
        await connection.execute(
          'INSERT INTO core_projects (project_id, title, summary) VALUES (?, ?, ?)',
          [project.projectId, project.title, project.summary]
        );

        for (const ods of project.focusOds || []) {
          await connection.execute(
            'INSERT INTO core_focus_ods (project_id, ods) VALUES (?, ?)',
            [project.projectId, ods]
          );
        }

        for (const record of project.records || []) {
          await connection.execute(
            `INSERT INTO core_records (project_id, indicator, meta, ods, tipo_dato, instrumento, valor_ejemplo, unidad, territorio)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              project.projectId,
              record.indicator || '',
              record.meta || '',
              record.ods || '',
              record.tipoDato || '',
              record.instrumento || '',
              JSON.stringify(record.valorEjemplo ?? null),
              record.unidad || '',
              record.territorio || ''
            ]
          );
        }

        for (const point of project.mapPoints || []) {
          await connection.execute(
            `INSERT INTO core_map_points (
              project_id, title, description, site_type, category, maslow_level, zip_code,
              ods_goal, smithsonian_guide, audience, color, lat, lng, project_name, city_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              project.projectId,
              point.title || '',
              point.description || '',
              point.siteType || '',
              point.category || '',
              point.maslowLevel || '',
              point.zipCode || '',
              point.odsGoal || '',
              point.smithsonianGuide || '',
              JSON.stringify(point.audience || []),
              point.color || '#2563EB',
              Number.isFinite(Number(point.lat)) ? Number(point.lat) : 0,
              Number.isFinite(Number(point.lng)) ? Number(point.lng) : 0,
              point.projectName || '',
              point.cityName || ''
            ]
          );
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getActors() {
    const [actorRows] = await this.pool.query(
      'SELECT actor_code AS actor, title FROM actors ORDER BY actor_code ASC'
    );

    const actors = [];
    for (const actorRow of actorRows) {
      const [itemRows] = await this.pool.execute(
        'SELECT tema, accion, indicador, ods, instrumento FROM actor_items WHERE actor_code = ? ORDER BY id ASC',
        [actorRow.actor]
      );
      actors.push({
        actor: actorRow.actor,
        title: actorRow.title,
        items: itemRows.map((row) => ({
          tema: row.tema || '',
          accion: row.accion || '',
          indicador: row.indicador || '',
          ods: row.ods || '',
          instrumento: row.instrumento || ''
        }))
      });
    }

    return actors;
  }

  async getActorByRole(role) {
    const actors = await this.getActors();
    return actors.find((actor) => String(actor.actor).toUpperCase() === String(role).toUpperCase()) || null;
  }

  async seedActorsIfEmpty() {
    const [[actorsCount]] = await this.pool.query('SELECT COUNT(*) AS count FROM actors');
    if (Number(actorsCount.count) > 0) {
      return;
    }

    const actors = await readActorsFromFiles();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const actor of actors) {
        await connection.execute(
          'INSERT INTO actors (actor_code, title) VALUES (?, ?)',
          [actor.actor, actor.title || actor.actor]
        );

        for (const item of actor.items || []) {
          await connection.execute(
            'INSERT INTO actor_items (actor_code, tema, accion, indicador, ods, instrumento) VALUES (?, ?, ?, ?, ?, ?)',
            [actor.actor, item.tema || '', item.accion || '', item.indicador || '', item.ods || '', item.instrumento || '']
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getFramework() {
    const [projectRows] = await this.pool.query(
      'SELECT project_key AS projectKey, project_name AS projectName, enfoque FROM framework_projects ORDER BY project_name ASC LIMIT 1'
    );
    const projectRow = projectRows[0];
    if (!projectRow) {
      return normalizeFrameworkPayload({ project: 'LATAM EN DATOS', justificacion: {}, matrizIndicadores: {} });
    }

    const [odsRows] = await this.pool.execute(
      'SELECT ods FROM framework_ods WHERE project_key = ? ORDER BY id ASC',
      [projectRow.projectKey]
    );
    const [metaRows] = await this.pool.execute(
      'SELECT meta FROM framework_metas WHERE project_key = ? ORDER BY id ASC',
      [projectRow.projectKey]
    );
    const [indicatorRows] = await this.pool.execute(
      `SELECT block_name AS blockName, indicador, ods, meta, tipo_dato AS tipoDato, instrumento
       FROM framework_indicators WHERE project_key = ? ORDER BY block_name ASC, order_index ASC`,
      [projectRow.projectKey]
    );

    const matrizIndicadores = indicatorRows.reduce((acc, row) => {
      if (!acc[row.blockName]) {
        acc[row.blockName] = [];
      }
      acc[row.blockName].push({
        indicador: row.indicador || '',
        ods: row.ods || '',
        meta: row.meta || '',
        tipoDato: row.tipoDato || '',
        instrumento: row.instrumento || ''
      });
      return acc;
    }, {});

    return {
      project: projectRow.projectName,
      justificacion: {
        odsAlineados: odsRows.map((row) => row.ods),
        metasPriorizadas: metaRows.map((row) => row.meta),
        enfoque: projectRow.enfoque || ''
      },
      matrizIndicadores
    };
  }

  async seedFrameworkIfEmpty() {
    const [[countRows]] = await this.pool.query('SELECT COUNT(*) AS count FROM framework_projects');
    if (Number(countRows.count) > 0) {
      return;
    }

    const payload = await readFrameworkFromFile();
    const projectKey = 'latam-en-datos';

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        'INSERT INTO framework_projects (project_key, project_name, enfoque) VALUES (?, ?, ?)',
        [projectKey, payload.project, payload.justificacion?.enfoque || '']
      );

      for (const ods of payload.justificacion?.odsAlineados || []) {
        await connection.execute(
          'INSERT INTO framework_ods (project_key, ods) VALUES (?, ?)',
          [projectKey, ods]
        );
      }

      for (const meta of payload.justificacion?.metasPriorizadas || []) {
        await connection.execute(
          'INSERT INTO framework_metas (project_key, meta) VALUES (?, ?)',
          [projectKey, meta]
        );
      }

      for (const [blockName, rows] of Object.entries(payload.matrizIndicadores || {})) {
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          await connection.execute(
            `INSERT INTO framework_indicators (
              project_key, block_name, order_index, indicador, ods, meta, tipo_dato, instrumento
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectKey,
              blockName,
              index,
              row.indicador || '',
              row.ods || '',
              row.meta || '',
              row.tipoDato || '',
              row.instrumento || ''
            ]
          );
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getStorageType() {
    return 'mysql';
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token requerido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
}

function authorize(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'No tienes permisos para esta acción.' });
    }
    return next();
  };
}

function parseCsv(buffer) {
  const content = buffer.toString('utf-8').trim();
  if (!content) {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1);

  return rows
    .filter(Boolean)
    .map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? '';
      });
      return record;
    });
}

function inferIndicatorCode(input = {}) {
  const provided = String(input.indicatorCode || '').trim().toUpperCase();
  if (INDICATOR_CODES.includes(provided)) {
    return provided;
  }
  const text = `${input.title || ''} ${input.description || ''} ${input.siteType || ''} ${input.category || ''}`.toLowerCase();
  if (text.includes('agua') || text.includes('acueduct')) return 'WATER';
  if (text.includes('residu') || text.includes('basura') || text.includes('recicl')) return 'WASTE';
  if (text.includes('conect') || text.includes('internet') || text.includes('digital')) return 'CONNECTIVITY';
  if (text.includes('infraestructura') || text.includes('escuela') || text.includes('colegio') || text.includes('aula')) return 'INFRASTRUCTURE';
  return 'OTHER';
}

function normalizeDateOnly(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizeEvidenceLevel(value) {
  const upper = String(value || '').trim().toUpperCase();
  if (!upper) return 'NO_DEFINIDA';
  return EVIDENCE_LEVELS.includes(upper) ? upper : '';
}

function validateNormalizedRecord(record) {
  const errors = [];

  if (!record.title || !String(record.title).trim()) {
    errors.push('title es requerido.');
  }
  if (!INDICATOR_CODES.includes(record.indicatorCode)) {
    errors.push(`indicatorCode inválido. Usa: ${INDICATOR_CODES.join(', ')}`);
  }
  if (record.evidenceLevel && !EVIDENCE_LEVELS.includes(record.evidenceLevel)) {
    errors.push(`evidenceLevel inválido. Usa: ${EVIDENCE_LEVELS.join(', ')}`);
  }
  if (record.measurementDate && !normalizeDateOnly(record.measurementDate)) {
    errors.push('measurementDate inválida. Usa formato YYYY-MM-DD o fecha ISO.');
  }
  if (!Number.isFinite(record.lat) || record.lat < -90 || record.lat > 90) {
    errors.push('lat fuera de rango (-90 a 90).');
  }
  if (!Number.isFinite(record.lng) || record.lng < -180 || record.lng > 180) {
    errors.push('lng fuera de rango (-180 a 180).');
  }

  return errors;
}

function filterRecordsByContext(records, context = {}) {
  const { country, city, indicatorCode, fromDate, toDate } = context;
  const from = normalizeDateOnly(fromDate);
  const to = normalizeDateOnly(toDate);

  return records.filter((record) => {
    const countryOk = country ? String(record.country || '').toLowerCase() === String(country).toLowerCase() : true;
    const cityOk = city ? String(record.city || '').toLowerCase() === String(city).toLowerCase() : true;
    const indicatorOk = indicatorCode
      ? String(record.indicatorCode || '').toUpperCase() === String(indicatorCode).toUpperCase()
      : true;

    const day = normalizeDateOnly(record.measurementDate || record.createdAt);
    const fromOk = from && day ? day >= from : true;
    const toOk = to && day ? day <= to : true;

    return countryOk && cityOk && indicatorOk && fromOk && toOk;
  });
}

function countBy(items, mapper) {
  return items.reduce((acc, item) => {
    const key = mapper(item) || 'NO_DEFINIDO';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(counter, limit = 3) {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function buildAssistantReply({ message, filteredRecords, totalRecords, context }) {
  const byIndicator = countBy(filteredRecords, (record) => record.indicatorCode || 'OTHER');
  const byCountry = countBy(filteredRecords, (record) => record.country || 'No definido');
  const byCity = countBy(filteredRecords, (record) => record.city || 'No definida');
  const byEvidence = countBy(filteredRecords, (record) => record.evidenceLevel || 'NO_DEFINIDA');

  const topIndicators = topEntries(byIndicator, 3);
  const topCountries = topEntries(byCountry, 3);
  const topCities = topEntries(byCity, 3);

  const scopeLabel = [
    context.country ? `país: ${context.country}` : null,
    context.city ? `ciudad: ${context.city}` : null,
    context.indicatorCode ? `indicador: ${context.indicatorCode}` : null,
    context.fromDate ? `desde: ${context.fromDate}` : null,
    context.toDate ? `hasta: ${context.toDate}` : null
  ]
    .filter(Boolean)
    .join(' | ');

  const intro = filteredRecords.length
    ? `Analicé ${filteredRecords.length} registros de un total de ${totalRecords}${scopeLabel ? ` (${scopeLabel})` : ''}.`
    : `No hay registros para el contexto solicitado${scopeLabel ? ` (${scopeLabel})` : ''}.`;

  const indicatorLine = topIndicators.length
    ? `Indicadores más frecuentes: ${topIndicators.map((item) => `${item.name} (${item.value})`).join(', ')}.`
    : 'No se identificaron indicadores con datos suficientes.';

  const territoryLine = topCountries.length
    ? `Mayor concentración territorial: ${topCountries.map((item) => `${item.name} (${item.value})`).join(', ')}.`
    : 'No fue posible identificar concentración territorial.';

  const insights = [];
  if (topIndicators.length) insights.push(`Predomina ${topIndicators[0].name} con ${topIndicators[0].value} registros.`);
  if (topCities.length) insights.push(`La ciudad con más evidencia es ${topCities[0].name} (${topCities[0].value}).`);
  if (Object.keys(byEvidence).length) {
    const evidenceTop = topEntries(byEvidence, 1)[0];
    if (evidenceTop) insights.push(`El tipo de evidencia más reportado es ${evidenceTop.name} (${evidenceTop.value}).`);
  }

  const suggestions = [
    'Comparar WATER, WASTE, CONNECTIVITY e INFRASTRUCTURE en el mismo periodo para identificar brechas.',
    'Reforzar registros con evidenceLevel y measurementDate para mejorar trazabilidad científica.',
    'Generar informe por país/ciudad con visualizaciones y conclusiones pedagógicas basadas en evidencia.'
  ];

  return {
    reply: `${intro} ${indicatorLine} ${territoryLine} Consulta recibida: "${String(message).slice(0, 220)}".`,
    insights,
    suggestions,
    dataSnapshot: {
      totalRecords,
      filteredRecords: filteredRecords.length,
      byIndicator,
      byCountry,
      byCity,
      byEvidence
    },
    disclaimer:
      'Este asistente entrega análisis heurístico basado en los datos actuales de la plataforma. No sustituye validación metodológica docente.',
    generatedAt: new Date().toISOString()
  };
}

function normalizeRecord(input, user) {
  const lat = Number(input.lat ?? input.latitude ?? 0);
  const lng = Number(input.lng ?? input.lon ?? input.longitude ?? 0);
  const indicatorCode = inferIndicatorCode(input);
  const evidenceLevel = normalizeEvidenceLevel(input.evidenceLevel || input.evidence || 'NO_DEFINIDA') || 'NO_DEFINIDA';
  const measurementDate = normalizeDateOnly(input.measurementDate || input.date || '');
  const audience = Array.isArray(input.audience)
    ? input.audience
    : String(input.audience || '')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    id: crypto.randomUUID(),
    title: input.title || 'Dato sin título',
    description: input.description || '',
    siteType: input.siteType || input.placeType || '',
    country: input.country || input.pais || '',
    region: input.region || input.departamento || '',
    city: input.city || input.cityName || input.ciudad || '',
    community: input.community || input.comunidad || '',
    schoolName: input.schoolName || input.school || input.institucion || '',
    indicatorCode,
    measurementDate,
    evidenceLevel,
    sourceInstrument: input.sourceInstrument || input.instrument || '',
    grade: String(input.grade || input.curso || ''),
    teamName: input.teamName || input.team || '',
    teacherName: input.teacherName || input.teacher || '',
    category: input.category || 'GENERAL',
    maslowLevel: input.maslowLevel || 'Sin clasificar',
    zipCode: input.zipCode || input.zip || '',
    odsGoal: input.odsGoal || '',
    smithsonianGuide: input.smithsonianGuide || '',
    audience,
    color: input.color || '#2563EB',
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    projectName: input.projectName || '',
    sourceFormat: input.sourceFormat || 'JSON',
    createdBy: user.username,
    createdAt: new Date().toISOString()
  };
}

function normalizeOpenDataRecord(input, user) {
  const base = normalizeRecord(
    {
      ...input,
      category: input.category || 'OPEN_DATA',
      sourceFormat: input.sourceFormat || 'OPEN_API',
      evidenceLevel: input.evidenceLevel || 'FUENTE_OFICIAL'
    },
    user || { username: 'open-data-bot' }
  );

  return {
    ...base,
    bloomLevel: String(input.bloomLevel || '').trim() || 'Analizar',
    officialValue: Number.isFinite(Number(input.officialValue)) ? Number(input.officialValue) : null,
    officialUnit: String(input.officialUnit || '').trim() || '',
    officialYear: Number.isFinite(Number(input.officialYear)) ? Number(input.officialYear) : null,
    sourceUrl: String(input.sourceUrl || '').trim() || ''
  };
}

function toOpenDataPoint(record) {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    siteType: record.siteType,
    country: record.country,
    region: record.region,
    city: record.city,
    community: record.community,
    schoolName: record.schoolName,
    indicatorCode: record.indicatorCode,
    measurementDate: record.measurementDate,
    evidenceLevel: record.evidenceLevel,
    sourceInstrument: record.sourceInstrument,
    category: record.category,
    maslowLevel: record.maslowLevel,
    bloomLevel: record.bloomLevel || '',
    smithsonianGuide: record.smithsonianGuide,
    color: record.color,
    lat: Number(record.lat),
    lng: Number(record.lng),
    sourceFormat: record.sourceFormat,
    projectName: record.projectName,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    officialValue: record.officialValue ?? null,
    officialUnit: record.officialUnit || '',
    officialYear: record.officialYear ?? null,
    sourceUrl: record.sourceUrl || ''
  };
}

async function ensureOpenDataStore() {
  await ensureFile(openDataFile, seedOpenData);
}

async function readOpenDataStore() {
  await ensureOpenDataStore();
  const payload = await readJson(openDataFile);
  return {
    datasetId: payload?.datasetId || seedOpenData.datasetId,
    title: payload?.title || seedOpenData.title,
    summary: payload?.summary || seedOpenData.summary,
    generatedAt: payload?.generatedAt || new Date().toISOString(),
    sourceNotes: Array.isArray(payload?.sourceNotes) ? payload.sourceNotes : [],
    records: Array.isArray(payload?.records) ? payload.records : [],
    mapPoints: Array.isArray(payload?.mapPoints) ? payload.mapPoints : []
  };
}

async function writeOpenDataStore(payload) {
  await fs.mkdir(openDataDir, { recursive: true });
  await writeJson(openDataFile, payload);
}

function toCsv(records) {
  const headers = [
    'id',
    'title',
    'description',
    'siteType',
    'country',
    'region',
    'city',
    'community',
    'schoolName',
    'indicatorCode',
    'measurementDate',
    'evidenceLevel',
    'sourceInstrument',
    'grade',
    'teamName',
    'teacherName',
    'category',
    'maslowLevel',
    'zipCode',
    'odsGoal',
    'smithsonianGuide',
    'audience',
    'color',
    'lat',
    'lng',
    'projectName',
    'sourceFormat',
    'createdBy',
    'createdAt'
  ];

  const lines = [headers.join(',')];
  for (const record of records) {
    lines.push(
      headers
        .map((header) => {
          const value = header === 'audience' ? (record[header] || []).join('|') : (record[header] ?? '');
          const safe = String(value).replace(/"/g, '""');
          return `"${safe}"`;
        })
        .join(',')
    );
  }
  return lines.join('\n');
}

function toGeoJson(records) {
  return {
    type: 'FeatureCollection',
    features: records
      .filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng))
      .map((record) => ({
        type: 'Feature',
        properties: {
          id: record.id,
          title: record.title,
          country: record.country,
          region: record.region,
          city: record.city,
          community: record.community,
          schoolName: record.schoolName,
          indicatorCode: record.indicatorCode,
          measurementDate: record.measurementDate,
          evidenceLevel: record.evidenceLevel,
          sourceInstrument: record.sourceInstrument,
          grade: record.grade,
          teamName: record.teamName,
          teacherName: record.teacherName,
          siteType: record.siteType,
          category: record.category,
          maslowLevel: record.maslowLevel,
          zipCode: record.zipCode,
          odsGoal: record.odsGoal,
          smithsonianGuide: record.smithsonianGuide,
          color: record.color,
          projectName: record.projectName,
          createdAt: record.createdAt
        },
        geometry: {
          type: 'Point',
          coordinates: [record.lng, record.lat]
        }
      }))
  };
}

app.get('/api/health', async (_, res) => {
  res.json({
    ok: true,
    service: 'LATAM en Datos API',
    storage: await store.getStorageType(),
    time: new Date().toISOString()
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Usuario y contraseña son requeridos.' });
    }

    const user = await store.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const token = signToken(user);
    return res.json({ token, user: toPublicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Error autenticando usuario.', detail: error.message });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/dashboard', authenticate, async (_, res) => {
  try {
    const records = await store.getRecords();
    const projects = await store.getProjects();
    const users = await store.listUsersPublic();

    const byMaslow = records.reduce((acc, record) => {
      acc[record.maslowLevel] = (acc[record.maslowLevel] || 0) + 1;
      return acc;
    }, {});

    const byCategory = records.reduce((acc, record) => {
      acc[record.category] = (acc[record.category] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalRecords: records.length,
      mappedRecords: records.filter((record) => record.lat && record.lng).length,
      totalProjects: projects.length,
      totalUsers: users.length,
      byMaslow,
      byCategory,
      latestRecords: records.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error construyendo dashboard.', detail: error.message });
  }
});

app.get('/api/data', authenticate, authorize(API_CONSUMER_ROLES), async (req, res) => {
  try {
    const records = await store.getRecords();
    const { category, maslowLevel, audience, country, city, indicatorCode, fromDate, toDate } = req.query;

    const filtered = records.filter((record) => {
      const categoryOk = category ? record.category === category : true;
      const maslowOk = maslowLevel ? record.maslowLevel === maslowLevel : true;
      const audienceOk = audience ? (record.audience || []).includes(audience) : true;
      const countryOk = country ? String(record.country || '').toLowerCase() === String(country).toLowerCase() : true;
      const cityOk = city ? String(record.city || '').toLowerCase() === String(city).toLowerCase() : true;
      const indicatorOk = indicatorCode ? String(record.indicatorCode || '').toUpperCase() === String(indicatorCode).toUpperCase() : true;

      const day = normalizeDateOnly(record.measurementDate || record.createdAt);
      const fromOk = fromDate && day ? day >= normalizeDateOnly(fromDate) : true;
      const toOk = toDate && day ? day <= normalizeDateOnly(toDate) : true;

      return categoryOk && maslowOk && audienceOk && countryOk && cityOk && indicatorOk && fromOk && toOk;
    });

    res.json({ count: filtered.length, data: filtered });
  } catch (error) {
    res.status(500).json({ message: 'Error consultando datos.', detail: error.message });
  }
});

app.get('/api/map/points', authenticate, async (_, res) => {
  try {
    const records = await store.getRecords();
    const points = records
      .filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng) && record.lat !== 0 && record.lng !== 0)
      .map((record) => ({
        id: record.id,
        title: record.title,
        description: record.description,
        siteType: record.siteType,
        country: record.country,
        region: record.region,
        city: record.city,
        community: record.community,
        schoolName: record.schoolName,
        indicatorCode: record.indicatorCode,
        measurementDate: record.measurementDate,
        evidenceLevel: record.evidenceLevel,
        sourceInstrument: record.sourceInstrument,
        grade: record.grade,
        teamName: record.teamName,
        teacherName: record.teacherName,
        category: record.category,
        maslowLevel: record.maslowLevel,
        zipCode: record.zipCode,
        odsGoal: record.odsGoal,
        smithsonianGuide: record.smithsonianGuide,
        color: record.color,
        lat: record.lat,
        lng: record.lng,
        sourceFormat: record.sourceFormat,
        projectName: record.projectName,
        createdBy: record.createdBy,
        createdAt: record.createdAt
      }));

    res.json({ count: points.length, points });
  } catch (error) {
    res.status(500).json({ message: 'Error consultando puntos del mapa.', detail: error.message });
  }
});

app.get('/api/projects/recent', authenticate, async (_, res) => {
  try {
    const projects = await store.getProjects();
    const recent = [...projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
    res.json({ projects: recent });
  } catch (error) {
    res.status(500).json({ message: 'Error consultando proyectos.', detail: error.message });
  }
});

app.get('/api/open-data', authenticate, async (req, res) => {
  try {
    const payload = await store.getOpenDataPayload();
    const { country, city, indicatorCode, fromDate, toDate, bloomLevel } = req.query;
    const filtered = filterRecordsByContext(payload.records, {
      country,
      city,
      indicatorCode,
      fromDate,
      toDate
    }).filter((record) => {
      if (!bloomLevel) return true;
      return String(record.bloomLevel || '').toLowerCase() === String(bloomLevel).toLowerCase();
    });

    return res.json({
      datasetId: payload.datasetId,
      title: payload.title,
      summary: payload.summary,
      generatedAt: payload.generatedAt,
      sourceNotes: payload.sourceNotes,
      count: filtered.length,
      records: filtered
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando open data.', detail: error.message });
  }
});

app.get('/api/open-data/points', authenticate, async (req, res) => {
  try {
    const payload = await store.getOpenDataPayload();
    const { country, city, indicatorCode, fromDate, toDate, bloomLevel } = req.query;
    const filtered = filterRecordsByContext(payload.records, {
      country,
      city,
      indicatorCode,
      fromDate,
      toDate
    }).filter((record) => {
      if (!bloomLevel) return true;
      return String(record.bloomLevel || '').toLowerCase() === String(bloomLevel).toLowerCase();
    });

    const points = filtered
      .filter((record) => Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lng)))
      .map((record) => toOpenDataPoint(record));

    return res.json({
      datasetId: payload.datasetId,
      title: payload.title,
      generatedAt: payload.generatedAt,
      sourceNotes: payload.sourceNotes,
      count: points.length,
      points
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando puntos de open data.', detail: error.message });
  }
});

app.post('/api/open-data', authenticate, authorize([Roles.ADMIN, Roles.AGENTE_AUTORIZADO]), async (req, res) => {
  try {
    const payload = await store.getOpenDataPayload();
    const inputRecords = Array.isArray(req.body?.records) ? req.body.records : [];

    if (!inputRecords.length) {
      return res.status(400).json({ message: 'Debes enviar records (array) con al menos un elemento.' });
    }

    const normalized = [];
    const rejected = [];

    inputRecords.forEach((item, index) => {
      const record = normalizeOpenDataRecord(item, req.user);
      const errors = validateNormalizedRecord(record);
      if (errors.length) {
        rejected.push({ index, title: item?.title || 'Sin título', errors });
        return;
      }
      normalized.push(record);
    });

    if (!normalized.length) {
      return res.status(400).json({
        message: 'Ningún registro open data válido para insertar.',
        inserted: 0,
        rejectedCount: rejected.length,
        rejected
      });
    }

    const saveResult = await store.addOpenDataRecords({
      records: normalized,
      title: req.body?.title || payload.title,
      summary: req.body?.summary || payload.summary,
      sourceNotes: Array.isArray(req.body?.sourceNotes) ? req.body.sourceNotes : undefined
    });

    return res.status(201).json({
      message: rejected.length ? 'Open data cargado con observaciones.' : 'Open data cargado correctamente.',
      inserted: normalized.length,
      rejectedCount: rejected.length,
      rejected,
      total: saveResult.total
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error cargando open data.', detail: error.message });
  }
});

app.get('/api/core-projects', authenticate, async (_, res) => {
  try {
    const projects = await store.getCoreProjects();
    return res.json({ count: projects.length, projects });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando proyectos CORE.', detail: error.message });
  }
});

app.get('/api/core-projects/:projectId', authenticate, async (req, res) => {
  try {
    const project = await store.getCoreProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: 'Proyecto CORE no encontrado.' });
    }
    return res.json({ project });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando proyecto CORE.', detail: error.message });
  }
});

app.get('/api/actors', authenticate, async (req, res) => {
  try {
    const actors = await store.getActors();
    const { role } = req.query;

    if (role) {
      const actor = actors.find((item) => String(item.actor).toUpperCase() === String(role).toUpperCase());
      if (!actor) {
        return res.status(404).json({ message: 'Actor no encontrado.' });
      }
      return res.json({ actor });
    }

    return res.json({ count: actors.length, actors });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando actores.', detail: error.message });
  }
});

app.get('/api/framework', authenticate, async (req, res) => {
  try {
    const payload = await store.getFramework();
    const block = String(req.query?.block || '').trim();

    if (!block) {
      return res.json(payload);
    }

    const rows = payload?.matrizIndicadores?.[block];
    if (!Array.isArray(rows)) {
      return res.status(404).json({ message: 'Bloque no encontrado en matrizIndicadores.' });
    }

    return res.json({
      project: payload.project,
      justificacion: payload.justificacion,
      block,
      count: rows.length,
      indicadores: rows
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error consultando framework.', detail: error.message });
  }
});

app.post('/api/ai/chat', authenticate, authorize(ALL_ROLES), async (req, res) => {
  try {
    const { message, context = {} } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'message es requerido y debe ser texto.' });
    }

    const cleanMessage = message.trim();
    if (cleanMessage.length < 3) {
      return res.status(400).json({ message: 'message debe tener al menos 3 caracteres.' });
    }
    if (cleanMessage.length > 1500) {
      return res.status(400).json({ message: 'message excede el límite de 1500 caracteres.' });
    }

    const requestedIndicator = context.indicatorCode ? String(context.indicatorCode).toUpperCase() : '';
    if (requestedIndicator && !INDICATOR_CODES.includes(requestedIndicator)) {
      return res.status(400).json({
        message: `indicatorCode inválido. Usa: ${INDICATOR_CODES.join(', ')}`
      });
    }

    const records = await store.getRecords();
    const scopedRecords = filterRecordsByContext(records, {
      country: context.country,
      city: context.city,
      indicatorCode: requestedIndicator || undefined,
      fromDate: context.fromDate,
      toDate: context.toDate
    });

    const analysis = buildAssistantReply({
      message: cleanMessage,
      filteredRecords: scopedRecords,
      totalRecords: records.length,
      context: {
        country: context.country,
        city: context.city,
        indicatorCode: requestedIndicator,
        fromDate: context.fromDate,
        toDate: context.toDate
      }
    });

    return res.json({
      assistant: 'LATAM_EDU_AI',
      model: 'heuristic-v1',
      ...analysis
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error generando respuesta del asistente.', detail: error.message });
  }
});

app.get('/api/export/:format', authenticate, authorize(API_CONSUMER_ROLES), async (req, res) => {
  try {
    const { format } = req.params;
    const records = await store.getRecords();

    if (format === 'json') {
      return res.json({ data: records });
    }

    if (format === 'csv') {
      const csv = toCsv(records);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="latam-en-datos.csv"');
      return res.send(csv);
    }

    if (format === 'geojson') {
      return res.json(toGeoJson(records));
    }

    return res.status(400).json({ message: 'Formato no soportado. Usa json, csv o geojson.' });
  } catch (error) {
    return res.status(500).json({ message: 'Error exportando datos.', detail: error.message });
  }
});

app.post(
  '/api/data/upload',
  authenticate,
  authorize([Roles.ADMIN, Roles.AGENTE_AUTORIZADO]),
  upload.single('file'),
  async (req, res) => {
    try {
      let inputRecords = [];

      if (req.file) {
        const extension = path.extname(req.file.originalname).toLowerCase();
        if (extension === '.json') {
          const parsed = JSON.parse(req.file.buffer.toString('utf-8'));
          inputRecords = Array.isArray(parsed) ? parsed : parsed.records || [];
        } else if (extension === '.csv') {
          inputRecords = parseCsv(req.file.buffer);
        } else {
          return res.status(400).json({ message: 'Formato de archivo no soportado. Usa JSON o CSV.' });
        }
      } else if (Array.isArray(req.body.records)) {
        inputRecords = req.body.records;
      } else {
        return res.status(400).json({ message: 'Debes enviar un archivo o un arreglo records.' });
      }

      const normalized = [];
      const rejected = [];

      inputRecords.forEach((item, index) => {
        const record = normalizeRecord(
          {
            ...item,
            sourceFormat: req.file ? path.extname(req.file.originalname).replace('.', '').toUpperCase() : 'JSON'
          },
          req.user
        );

        const errors = validateNormalizedRecord(record);
        if (errors.length) {
          rejected.push({ index, title: item?.title || 'Sin título', errors });
          return;
        }
        normalized.push(record);
      });

      if (!normalized.length) {
        return res.status(400).json({
          message: 'Ningún registro válido para insertar.',
          inserted: 0,
          rejectedCount: rejected.length,
          rejected
        });
      }

      await store.addRecords(normalized);

      io.emit(
        'records:created',
        normalized
          .filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng) && record.lat !== 0 && record.lng !== 0)
          .map((record) => ({
            id: record.id,
            title: record.title,
            category: record.category,
            maslowLevel: record.maslowLevel,
            color: record.color,
            lat: record.lat,
            lng: record.lng,
            projectName: record.projectName,
            createdAt: record.createdAt
          }))
      );

      return res.status(201).json({
        message: rejected.length ? 'Datos cargados con observaciones.' : 'Datos cargados correctamente.',
        inserted: normalized.length,
        rejectedCount: rejected.length,
        rejected
      });
    } catch (error) {
      return res.status(500).json({ message: 'Error cargando datos.', detail: error.message });
    }
  }
);

app.get('/api/admin/roles', authenticate, authorize([Roles.ADMIN]), (_, res) => {
  res.json({ roles: ALL_ROLES });
});

app.get('/api/admin/users', authenticate, authorize([Roles.ADMIN]), async (_, res) => {
  try {
    const users = await store.listUsersPublic();
    res.json({ users, roles: ALL_ROLES });
  } catch (error) {
    res.status(500).json({ message: 'Error listando usuarios.', detail: error.message });
  }
});

app.post('/api/admin/users', authenticate, authorize([Roles.ADMIN]), async (req, res) => {
  try {
    const { username, fullName, role, password } = req.body;
    if (!username || !fullName || !role || !password) {
      return res.status(400).json({ message: 'username, fullName, role y password son requeridos.' });
    }
    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Rol inválido.' });
    }

    const existing = await store.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: 'El username ya existe.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await store.createUser({ username, fullName, role, passwordHash });
    return res.status(201).json({ user: created });
  } catch (error) {
    return res.status(500).json({ message: 'Error creando usuario.', detail: error.message });
  }
});

app.put('/api/admin/users/:id', authenticate, authorize([Roles.ADMIN]), async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, role } = req.body;
    if (!fullName || !role) {
      return res.status(400).json({ message: 'fullName y role son requeridos.' });
    }
    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Rol inválido.' });
    }

    const updated = await store.updateUser(id, { fullName, role });
    if (!updated) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    return res.json({ user: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Error actualizando usuario.', detail: error.message });
  }
});

app.put('/api/admin/users/:id/password', authenticate, authorize([Roles.ADMIN]), async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'password es requerido.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await store.updatePassword(id, passwordHash);
    if (!updated) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    return res.json({ message: 'Contraseña actualizada.' });
  } catch (error) {
    return res.status(500).json({ message: 'Error actualizando contraseña.', detail: error.message });
  }
});

app.delete('/api/admin/users/:id', authenticate, authorize([Roles.ADMIN]), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ message: 'No puedes eliminar tu propio usuario.' });
    }
    const deleted = await store.deleteUser(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    return res.json({ message: 'Usuario eliminado.' });
  } catch (error) {
    return res.status(500).json({ message: 'Error eliminando usuario.', detail: error.message });
  }
});

io.on('connection', (socket) => {
  socket.emit('connected', { message: 'Conectado al stream de datos en tiempo real.' });
});

async function initStore() {
  if (USE_MYSQL) {
    store = new MySqlStore();
    await store.init();
    console.log('Storage activo: MySQL');
  } else {
    store = new JsonStore();
    await store.init();
    console.log('Storage activo: JSON local');
  }
  if ((await store.getStorageType()) === 'json') {
    await ensureOpenDataStore();
  }
}

initStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`LATAM en Datos corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error inicializando la aplicación:', error);
    process.exit(1);
  });