import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { AppDataSource } from './data-source';
import mainRouter from './routes';
import { passport } from './services/authService';
import { config } from './config';

const app = express();
const port = process.env.PORT || 3001;

app.use(
  cors({
    origin: config.frontend.url,
    credentials: true,
  })
);
app.use(express.json());

app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use('/api', mainRouter);

AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Error during Data Source initialization:', err);
  });