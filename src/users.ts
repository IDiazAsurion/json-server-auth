import * as bcrypt from 'bcryptjs'
import { RequestHandler, Router } from 'express'
import * as jwt from 'jsonwebtoken'
import {
	EMAIL_REGEX,
	JWT_EXPIRES_IN,
	JWT_SECRET_KEY,
	MIN_PASSWORD_LENGTH,
	SALT_LENGTH,
} from './constants'
import { bodyParsingHandler, errorHandler } from './shared-middlewares'

/**
 * User Interface
 */
interface User {
	id: string
	email: string
	password: string
	[key: string]: any // Allow any other field
}

/**
 * Register / Create a user
 */
const create: RequestHandler = (req, res, next) => {
	const { email, password, ...rest } = req.body as Partial<User>
	const { db } = req.app

	if (db == null) {
		// json-server CLI expose the router db to the app
		// (https://github.com/typicode/json-server/blob/master/src/cli/run.js#L74),
		// but if we use the json-server module API, we must do the same.
		throw Error('You must bind the router db to the app')
	}

	if (!email || !email.trim() || !password || !password.trim()) {
		res.status(400).jsonp('Email and password are required')
		return
	}

	if (!email.match(EMAIL_REGEX)) {
		res.status(400).jsonp('Email format is invalid')
		return
	}

	if (password.length < MIN_PASSWORD_LENGTH) {
		res.status(400).jsonp('Password is too short')
		return
	}

	bcrypt
		.hash(password, SALT_LENGTH)
		.then((hash) => {
			// Create users collection if doesn't exist,
			// save password as hash and add any other field without validation
			try {
				return db
					.get('users')
					.insert({ email, password: hash, ...rest })
					.write()
			} catch (error) {
				throw Error('You must add a "users" collection to your db')
			}
		})
		.then((user: User) => {
			// Return an access token instead of the user record
			const accessToken = jwt.sign({ email }, JWT_SECRET_KEY, {
				expiresIn: JWT_EXPIRES_IN,
				subject: String(user.id),
			})
			res.status(201).jsonp({ accessToken })
		})
		.catch(next)
}

/**
 * Login
 */
const login: RequestHandler = (req, res, next) => {
	const { email, password } = req.body as Partial<User>
	const { db } = req.app

	if (db == null) {
		throw Error('You must bind the router db to the app')
	}

	if (!email || !email.trim() || !password || !password.trim()) {
		res.status(400).jsonp('Email and password are required')
		return
	}

	// prettier-ignore
	const user = db.get('users').find({ email }).value() as User

	if (!user) {
		res.status(400).jsonp('Cannot find user')
		return
	}

	bcrypt
		.compare(password, user.password)
		.then((same) => {
			if (!same) {
				res.status(400).jsonp('Incorrect password')
				return
			}

			const accessToken = jwt.sign({ email }, JWT_SECRET_KEY, {
				expiresIn: JWT_EXPIRES_IN,
				subject: String(user.id),
			})

			res.status(200).jsonp({ accessToken })
		})
		.catch(next)
}

const update: RequestHandler = (req, res, next) => {
	const { email, password } = req.body as Partial<User>

	if (email && !email.match(EMAIL_REGEX)) {
		res.status(400).jsonp('Email format is invalid')
		return
	}

	if (password) {
		if (password.length < MIN_PASSWORD_LENGTH) {
			res.status(400).jsonp('Password is too short')
			return
		}

		// Reencrypt password on update
		req.body.password = bcrypt.hashSync(password, SALT_LENGTH)
	}

	// TODO: create new access token when password or email changes

	// Continue with json-server router
	next()
}

/**
 * Users router
 */
export default Router()
	.use(bodyParsingHandler)
	.post('/users|register|signup', create)
	.post('/login|signin', login)
	.put('/users/:id', update)
	.patch('/users/:id', update)
	.use(errorHandler)
