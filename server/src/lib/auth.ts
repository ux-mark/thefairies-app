import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins/admin'
import Database from 'better-sqlite3'

const dbPath = process.env.FAIRY_DB_PATH || './data/thefairies.sqlite'

export const auth = betterAuth({
  database: new Database(dbPath),
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh session token daily
    cookieCache: {
      enabled: true,
      maxAge: 300, // 5 minutes
    },
  },
  plugins: [
    admin(),
  ],
})
