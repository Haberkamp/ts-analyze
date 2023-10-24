export default class User {
    #user;

    constructor(user) {
        this.#user = user;
    }

    getId() {
        return this.getId;
    }

    getFirstName() {
        return this.#user.firstName;
    }

    getLastName() {
        return this.#user.lastName;
    }
}