import { post } from "../httpClient.js";

export default class HttpUserRepository {
    async create(user) {
        const response = await post('/api/user/create', user);

        return response;
    }

    async remove(id) {
        const { id: idOfRemovedUser } = await post('/api/user/remove', {
            id,
        });

        return idOfRemovedUser;
    }
}