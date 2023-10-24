import User from "./entities/user.js";
import HttpUserRepository from "./repositories/HttpUserRepository.js";

function getFullName(firstName, lastName) {
    return `${firstName} ${lastName}`;
}

const user = new User({
    id: 1,
    firstName: 'Steve',
    lastName: 'Jobs'
});

const userRepo = new HttpUserRepository();
const savedUser = await userRepo.create(user);

const fullName = getFullName(
    savedUser.getFirstName(),
    savedUser.getLastName()
);

console.log({ fullName });
