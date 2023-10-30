import { get } from './httpClient';

export default class UserRepository {
	getAll() {
		get('/api/user/all');
	}
}
