export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UsersRepository {
  constructor(private readonly db: D1Database) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE email = ?1 LIMIT 1")
      .bind(email.toLowerCase().trim())
      .first<UserRow>();
    return row ? mapRow(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE id = ?1 LIMIT 1")
      .bind(id)
      .first<UserRow>();
    return row ? mapRow(row) : null;
  }

  async create(id: string, email: string, passwordHash: string, name?: string): Promise<User> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
      )
      .bind(id, email.toLowerCase().trim(), passwordHash, name ?? null, now)
      .run();

    const created = await this.findById(id);
    if (!created) throw new Error("User creation failed");
    return created;
  }
}
