import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import passport from 'passport';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/userRole.entity';
import { Role } from '../entities/role.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { createHistoryEntry, autoSetPrimaryRetreat } from './retreatParticipantService';

/**
 * Minimal subset of `passport-google-oauth20`'s Profile shape that we read.
 * Extracted so unit tests can construct mock profiles without pulling the
 * passport dependency.
 */
export interface MinimalGoogleProfile {
	id: string;
	displayName?: string;
	emails?: { value?: string }[];
	photos?: { value?: string }[];
}

/**
 * Resolve (or create) the User backed by a Google OAuth profile.
 *
 * Extracted from the GoogleStrategy verify callback so it can be unit-tested
 * without going through passport. The strategy delegates here; behavior is
 * identical to the previous inline implementation.
 *
 * Trust model: Google has just authenticated the user via OAuth, so the email
 * on the profile is treated as verified end-to-end. All three code paths
 * (existing googleId, link to local user, new account) flip emailVerified=true.
 */
export async function resolveGoogleUser(
	dataSource: DataSource | undefined,
	profile: MinimalGoogleProfile,
): Promise<User> {
	const repos = getRepositories(dataSource);

	// 1) Existing Google user — defense-in-depth flip in case they predate the column.
	const userByGoogleId = await repos.user.findOne({ where: { googleId: profile.id } });
	if (userByGoogleId) {
		if (!userByGoogleId.emailVerified) {
			userByGoogleId.emailVerified = true;
			userByGoogleId.emailVerificationToken = null;
			userByGoogleId.emailVerificationExpiresAt = null;
			await repos.user.save(userByGoogleId);
		}
		return userByGoogleId;
	}

	const userEmail = profile.emails?.[0]?.value?.toLowerCase().trim();

	// 2) Existing local user with the same email — link Google + promote to verified.
	if (userEmail) {
		const userByEmail = await repos.user
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email: userEmail })
			.getOne();

		if (userByEmail) {
			userByEmail.googleId = profile.id;
			userByEmail.photo = profile.photos?.[0]?.value || userByEmail.photo;
			userByEmail.emailVerified = true;
			userByEmail.emailVerificationToken = null;
			userByEmail.emailVerificationExpiresAt = null;
			if (profile.displayName && profile.displayName !== userByEmail.displayName) {
				userByEmail.displayName = profile.displayName;
			}
			await repos.user.save(userByEmail);
			return userByEmail;
		}
	}

	// 3) New user — born verified because Google attests the email.
	const newUser = repos.user.create({
		id: uuidv4(),
		googleId: profile.id,
		displayName: profile.displayName,
		email: userEmail || '',
		photo: profile.photos?.[0]?.value,
		emailVerified: true,
	});
	await repos.user.save(newUser);

	// Assign default role
	const defaultRole = await repos.role.findOne({ where: { name: 'regular' } });
	if (defaultRole) {
		const userRole = repos.userRole.create({
			userId: newUser.id,
			roleId: defaultRole.id,
		});
		await repos.userRole.save(userRole);
	}

	// Link any existing participants that share this email so retreat history
	// shows up immediately for the new user.
	if (userEmail) {
		try {
			const participantRepo = dataSource
				? dataSource.getRepository(Participant)
				: AppDataSource.getRepository(Participant);
			const existingParticipants = await participantRepo
				.createQueryBuilder('participant')
				.leftJoinAndSelect('participant.retreat', 'retreat')
				.where('LOWER(participant.email) = :email', { email: userEmail })
				.getMany();

			if (existingParticipants.length > 0) {
				console.warn(
					`Found ${existingParticipants.length} existing participant(s) for new user ${userEmail}, linking accounts...`,
				);

				// Overlay virtual `type` from retreat_participants so the
				// roleInRetreat below doesn't always default to 'server'.
				const rpRepoType = dataSource
					? dataSource.getRepository(RetreatParticipant)
					: AppDataSource.getRepository(RetreatParticipant);
				const rpRowsForType = await rpRepoType.find({
					where: existingParticipants
						.filter((p) => p.retreatId)
						.map((p) => ({
							participantId: p.id,
							retreatId: p.retreatId!,
						})),
					select: ['participantId', 'retreatId', 'type'],
				});
				const typeByKey = new Map<string, string>();
				for (const row of rpRowsForType) {
					if (row.type) {
						typeByKey.set(`${row.participantId}:${row.retreatId}`, row.type);
					}
				}
				for (const p of existingParticipants) {
					if (p.retreatId) {
						const t = typeByKey.get(`${p.id}:${p.retreatId}`);
						if (t) p.type = t as Participant['type'];
					}
				}

				const mostRecentParticipant = existingParticipants.sort(
					(a, b) => b.registrationDate.getTime() - a.registrationDate.getTime(),
				)[0];

				newUser.participantId = mostRecentParticipant.id;
				await repos.user.save(newUser);

				for (const p of existingParticipants) {
					if (!p.userId) {
						p.userId = newUser.id;
						await participantRepo.save(p);
					}
				}

				const rpRepoLink = dataSource
					? dataSource.getRepository(RetreatParticipant)
					: AppDataSource.getRepository(RetreatParticipant);
				await rpRepoLink
					.createQueryBuilder()
					.update(RetreatParticipant)
					.set({ userId: newUser.id })
					.where('userId IS NULL AND participantId IN (:...ids)', {
						ids: existingParticipants.map((p) => p.id),
					})
					.execute();

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
										: participant.type === 'server' || participant.type === 'partial_server'
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

	return newUser;
}

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
						const user = await resolveGoogleUser(dataSource, profile);
						return done(null, user);
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
				const normalizedEmail = email.toLowerCase().trim();
				// Use case-insensitive query to handle pre-migration data
				const user = await repos.user
					.createQueryBuilder('user')
					.where('LOWER(user.email) = :email', { email: normalizedEmail })
					.getOne();

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
