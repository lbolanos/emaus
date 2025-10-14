import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import passport from 'passport';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/userRole.entity';
import { Role } from '../entities/role.entity';
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
			const userRoleRepository = AppDataSource.getRepository(UserRole);
			const roleRepository = AppDataSource.getRepository(Role);
			try {
				// First, check if user already exists with this Google ID
				const userByGoogleId = await userRepository.findOne({ where: { googleId: profile.id } });

				if (userByGoogleId) {
					return done(null, userByGoogleId);
				}

				// Check if user exists with this email (previously registered locally)
				const userEmail = profile.emails?.[0].value;
				if (userEmail) {
					const userByEmail = await userRepository.findOne({ where: { email: userEmail } });

					if (userByEmail) {
						// Link Google account to existing user
						userByEmail.googleId = profile.id;
						userByEmail.photo = profile.photos?.[0].value || userByEmail.photo;
						// Update display name if Google provides one and current one is different
						if (profile.displayName && profile.displayName !== userByEmail.displayName) {
							userByEmail.displayName = profile.displayName;
						}
						await userRepository.save(userByEmail);
						return done(null, userByEmail);
					}
				}

				// Create new user if neither Google ID nor email exists
				const newUser = userRepository.create({
					id: uuidv4(),
					googleId: profile.id,
					displayName: profile.displayName,
					email: userEmail || '',
					photo: profile.photos?.[0].value,
				});

				await userRepository.save(newUser);

				// Assign default role to new Google user
				const defaultRole = await roleRepository.findOne({ where: { name: 'regular' } });
				if (defaultRole) {
					const userRole = userRoleRepository.create({
						userId: newUser.id,
						roleId: defaultRole.id,
					});
					await userRoleRepository.save(userRole);
				}

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
