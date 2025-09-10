import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import passport from 'passport';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

// Google OAuth2 Strategy
passport.use(
	new GoogleStrategy(
		{
			clientID: config.google.clientId,
			clientSecret: config.google.clientSecret,
			callbackURL: config.google.callbackUrl,
		},
		async (accessToken, refreshToken, profile, done) => {
			const userRepository = AppDataSource.getRepository(User);
			try {
				let user = await userRepository.findOne({ where: { googleId: profile.id } });

				if (user) {
					return done(null, user);
				}

				const newUser = userRepository.create({
					id: uuidv4(),
					googleId: profile.id,
					displayName: profile.displayName,
					email: profile.emails?.[0].value || '',
					photo: profile.photos?.[0].value,
				});

				await userRepository.save(newUser);
				return done(null, newUser);
			} catch (error) {
				return done(error, undefined);
			}
		},
	),
);

// Local Email/Password Strategy
passport.use(
	new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
		const userRepository = AppDataSource.getRepository(User);
		try {
			const user = await userRepository.findOne({ where: { email } });

			if (!user) {
				return done(null, false, { message: 'Incorrect email or password.' });
			}

			if (!user.password) {
				return done(null, false, { message: 'Please log in with Google.' });
			}

			const isMatch = await bcrypt.compare(password, user.password);
			if (!isMatch) {
				return done(null, false, { message: 'Incorrect email or password.' });
			}

			return done(null, user);
		} catch (error) {
			return done(error);
		}
	}),
);

passport.serializeUser((user: any, done) => {
	done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
	const userRepository = AppDataSource.getRepository(User);
	try {
		const user = await userRepository.findOneBy({ id });
		done(null, user);
	} catch (error) {
		done(error, null);
	}
});

export { passport };
