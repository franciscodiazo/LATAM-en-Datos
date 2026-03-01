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

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'latam-datos-secret-dev';
const USE_MYSQL = process.env.USE_MYSQL === 'true' || process.env.NODE_ENV === 'production';
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const recordsFile = path.join(dataDir, 'records.json');
const projectsFile = path.join(dataDir, 'projects.json');

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
    const bootstrap = await mysql.createConnection({
      host: this.connectionConfig.host,
      port: this.connectionConfig.port,
      user: this.connectionConfig.user,
      password: this.connectionConfig.password
    });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${this.connectionConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await bootstrap.end();

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
      `SELECT id, title, description, site_type AS siteType, category, maslow_level AS maslowLevel, zip_code AS zipCode, ods_goal AS odsGoal,
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
          id, title, description, site_type, category, maslow_level, zip_code, ods_goal, smithsonian_guide,
          audience, color, lat, lng, project_name, source_format, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.title,
          record.description,
          record.siteType,
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

function normalizeRecord(input, user) {
  const lat = Number(input.lat ?? input.latitude ?? 0);
  const lng = Number(input.lng ?? input.lon ?? input.longitude ?? 0);
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

function toCsv(records) {
  const headers = [
    'id',
    'title',
    'description',
    'siteType',
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
    const { category, maslowLevel, audience } = req.query;

    const filtered = records.filter((record) => {
      const categoryOk = category ? record.category === category : true;
      const maslowOk = maslowLevel ? record.maslowLevel === maslowLevel : true;
      const audienceOk = audience ? (record.audience || []).includes(audience) : true;
      return categoryOk && maslowOk && audienceOk;
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

      const normalized = inputRecords.map((item) =>
        normalizeRecord(
          {
            ...item,
            sourceFormat: req.file ? path.extname(req.file.originalname).replace('.', '').toUpperCase() : 'JSON'
          },
          req.user
        )
      );

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

      return res.status(201).json({ message: 'Datos cargados correctamente.', inserted: normalized.length });
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