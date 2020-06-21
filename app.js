const path = require('path')
const express = require('express')
const app = express()
const sqlite = require('sqlite-async')

const run = async () => {
  const db = await sqlite.open(process.env.PORT ? 'db' : 'db_dev')
  await db.transaction(db => Promise.all([
    db.run(`CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT
    )`),
    db.run(`CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY,
      description TEXT,
      is_public INTERGER,
      user TEXT,
      FOREIGN KEY(user) REFERENCES users(username)
    )`),
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      description TEXT,
      list INTEGER,
      FOREIGN KEY(list) REFERENCES lists(id)
    )`)
  ]))

  app.use(express.json())

  // authorization
  app.use('/api/:id', async (req, res, next) => {
    const { body } = req
    if (body.username === '' || body.password === '') {
      return res.json({ code: 10, msg: 'Username or password cannot be blank' })
    }

    const user = await db.get(`SELECT * FROM users WHERE username='${req.body.username}'`)
    const code = !user ? 11 // no user
      : user.password !== req.body.password ? 12 // wrong password
      : 0 // valid

    const publicApis = ['login-register', 'get-public-lists', 'db']
    if (!publicApis.includes(req.params.id) && code !== 0) {
      res.json({ code, msg: 'Unauthorized user' })
    } else {
      res.locals.code = code
      next()
    }
  })

  // login route
  app.post('/api/login-register', async ({ body }, res) => {
    const code = res.locals.code
    if (code === 11) {
      // add new user if not exist
      await db.run(`INSERT INTO users(username, password)
      VALUES('${body.username}', '${body.password}')`)
      res.json({ code, msg: 'Account created' })
    } else if (code === 12) {
      res.json({ code, msg: 'Wrong password' })
    } else if (code === 0) {
      res.json({ code, msg: 'Logged in' })
    }
  })

  // list routes
  app.post('/api/get-public-lists', async ({ body }, res) => {
    const lists = await db.all(`SELECT * FROM lists
    WHERE user='${body.username}' AND is_public=1`)
    for (const e of lists) {
      e.children = await db.all(`SELECT * FROM tasks WHERE list=${e.id}`)
    }
    res.json({ code: 0, msg: 'List fetched', lists })
  })

  app.post('/api/get-lists', async ({ body }, res) => {
    const lists = await db.all(`SELECT * FROM lists WHERE user='${body.username}'`)
    for (const e of lists) {
      e.children = await db.all(`SELECT * FROM tasks WHERE list=${e.id}`)
    }
    res.json({ code: 0, msg: 'List fetched', lists })
  })

  app.post('/api/update-list', async ({ body }, res) => {
    if (body.id) {
      // update list if exist
      await db.run(`UPDATE lists
        SET description='${body.description}',
          is_public=${body.is_public}
        WHERE
          id=${body.id}
      `)
      res.json({ code: 0, msg: 'List updated' })
    } else {
      // create new if not
      await db.run(`INSERT INTO lists(description, is_public, user)
        VALUES('', 0, '${body.username}')`)
      const id = (await db.get(`SELECT last_insert_rowid()`))['last_insert_rowid()']
      res.json({ code: 0, msg: 'List created', id })
    }
  })

  app.post('/api/delete-list', async ({ body }, res) => {
    await db.run(`DELETE FROM tasks WHERE list=${body.id}`)
    await db.run(`DELETE FROM lists WHERE id=${body.id}`)
    res.json({ code: 0, msg: 'List deleted' })
  })

  // task routes
  app.post('/api/update-task', async ({ body }, res) => {
    if (body.id) {
      // update list if exist
      await db.run(`UPDATE tasks
        SET description='${body.description}'
        WHERE
          id=${body.id}
      `)
      res.json({ code: 0, msg: 'Task updated' })
    } else {
      // create new if not
      await db.run(`INSERT INTO tasks(description, list)
        VALUES('', '${body.listId}')`)
      const id = (await db.get(`SELECT last_insert_rowid()`))['last_insert_rowid()']
      res.json({ code: 0, msg: 'Task created', id })
    }
  })

  app.post('/api/delete-task', async ({ body }, res) => {
    await db.run(`DELETE FROM tasks WHERE id=${body.id}`)
    res.json({ code: 0, msg: 'Task deleted' })
  })

  // get db file (for dev purposes only)
  app.get('/api/db', (req, res) => res.sendFile(path.join(__dirname, 'db')))

  // home route
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))

  const port = process.env.PORT || 8080
  app.listen(port, () => console.log('Listening on port ' + port))
}

run()
