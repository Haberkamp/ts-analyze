import { get } from './core/httpClient';
import UserRepository from './core/UserRepository';

new UserRepository();

get('/api/foo');
