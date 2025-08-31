import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { User } from './entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
  await AppDataSource.initialize();
  const userRepository = AppDataSource.getRepository(User);

  const masterUserEmail = 'leonardo.bolanos@gmail.com';
  let masterUser = await userRepository.findOne({ where: { email: masterUserEmail } });

  if (!masterUser) {
    console.log(`Creating master user: ${masterUserEmail}`);
    masterUser = userRepository.create({
      id: uuidv4(),
      email: masterUserEmail,
      password: 'ewdesrrcdww', // The password will be hashed by the entity's BeforeInsert hook
      displayName: 'Leonardo Bolanos',
    });
    await userRepository.save(masterUser);
    console.log('Master user created.');
  } else {
    console.log('Master user already exists.');
  }

  await AppDataSource.destroy();
}

seed().catch((error) => console.error('Seeding failed:', error));
