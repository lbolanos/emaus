import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import passport from 'passport';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/userRole.entity';
import { Role } from '../entities/role.entity';
import { Participant } from '../entities/participant.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { createHistoryEntry, autoSetPrimaryRetreat } from './participantHistoryService';

/**
 * Configure passport strategies with a custom DataSource.
 * This allows tests to use a test database while production uses AppDataSource.
 */
export function configurePassportStrategies(
	passportInstance: typeof passport,
	dataSource?: DataSource,
) {
	const repos = getRepositories(dataSource);

	// Google OAuth2 Strategy - only register if credentials are configured
	if (config.google.clientId && config.google.clientSecret) {
		passportInstance.use(
			new GoogleStrategy(
				{
					clientID: config.google.clientId,
					clientSecret: config.google.clientSecret,
					callbackURL: config.google.callbackUrl,
				},
				async (accessToken, refreshToken, profile, done) => {
					try {
						// First, check if user already exists with this Google ID
						const userByGoogleId = await repos.user.findOne({ where: { googleId: profile.id } });

						if (userByGoogleId) {
							return done(null, userByGoogleId);
						}

						// Check if user exists with this email (previously registered locally)
						const userEmail = profile.emails?.[0].value;
						if (userEmail) {
							const userByEmail = await repos.user.findOne({ where: { email: userEmail } });

							if (userByEmail) {
								// Link Google account to existing user
								userByEmail.googleId = profile.id;
								userByEmail.photo = profile.photos?.[0].value || userByEmail.photo;
								// Update display name if Google provides one and current one is different
								if (profile.displayName && profile.displayName !== userByEmail.displayName) {
									userByEmail.displayName = profile.displayName;
								}
								await repos.user.save(userByEmail);
								return done(null, userByEmail);
							}
						}

						// Create new user if neither Google ID nor email exists
						const newUser = repos.user.create({
							id: uuidv4(),
							googleId: profile.id,
							displayName: profile.displayName,
							email: userEmail || '',
							photo: profile.photos?.[0].value,
						});

						await repos.user.save(newUser);

						// Assign default role to new Google user
						const defaultRole = await repos.role.findOne({ where: { name: 'regular' } });
						if (defaultRole) {
							const userRole = repos.userRole.create({
								userId: newUser.id,
								roleId: defaultRole.id,
							});
							await repos.userRole.save(userRole);
						}

						// Check if any existing participants have this email and link them
						if (userEmail) {
							try {
								const participantRepo = dataSource
									? dataSource.getRepository(Participant)
									: AppDataSource.getRepository(Participant);
								const existingParticipants = await participantRepo.find({
									where: { email: userEmail },
									relations: ['retreat'],
								});

								if (existingParticipants.length > 0) {
									console.warn(
										`Found ${existingParticipants.length} existing participant(s) for new user ${userEmail}, linking accounts...`,
									);

									// Link the most recent participant to the user
									const mostRecentParticipant = existingParticipants.sort(
										(a, b) => b.registrationDate.getTime() - a.registrationDate.getTime(),
									)[0];

									newUser.participantId = mostRecentParticipant.id;
									mostRecentParticipant.userId = newUser.id;
									await participantRepo.save(mostRecentParticipant);
									await repos.user.save(newUser);

									// Create history entries for all past participations
									for (const participant of existingParticipants) {
										if (participant.retreatId) {
											try {
												await createHistoryEntry({
													userId: newUser.id,
													participantId: participant.id,
													retreatId: participant.retreatId,
													roleInRetreat:
														participant.type === 'walker'
															? 'walker'
															: participant.type === 'server' ||
																  participant.type === 'partial_server'
																? 'server'
																: 'server',
													isPrimaryRetreat: false,
												});
												console.warn(
													`Created history entry for participant ${participant.id} in retreat ${participant.retreatId}`,
												);
											} catch (historyError) {
												console.error('Error creating history entry:', historyError);
											}
										}
									}

									// Auto-set primary retreat
									await autoSetPrimaryRetreat(newUser.id);

									console.warn(
										`Linked new user ${newUser.id} to ${existingParticipants.length} existing participant(s)`,
									);
								}
							} catch (linkError) {
								console.error('Error linking existing participants to new user:', linkError);
								// Don't fail user creation if linking fails
							}
						}

						return done(null, newUser);
					} catch (error) {
						return done(error, undefined);
					}
				},
			),
		);
	}

	// Local Email/Password Strategy
	passportInstance.use(
		new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
			try {
				const user = await repos.user.findOne({ where: { email } });

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

	passportInstance.serializeUser((user: any, done) => {
		done(null, user.id);
	});

	passportInstance.deserializeUser(async (id: string, done) => {
		try {
			const user = await repos.user.findOneBy({ id });
			done(null, user);
		} catch (error) {
			done(error, null);
		}
	});
}

// Configure passport with default AppDataSource for production use
// Skip auto-configuration in tests to allow test database configuration
if (process.env.NODE_ENV !== 'test') {
	configurePassportStrategies(passport);
}

export { passport };
