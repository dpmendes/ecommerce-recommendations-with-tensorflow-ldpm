export class UserService {
    #storageKey = 'ew-academy-users-v2';
    #datasetService;

    constructor({ datasetService }) {
        this.#datasetService = datasetService;
    }

    async getDefaultUsers() {
        const storedUsers = this.#getStorage();
        if (storedUsers.length) return storedUsers;

        const { users } = await this.#datasetService.getDataset();
        this.#setStorage(users);
        return users;
    }

    async getUsers() {
        const users = this.#getStorage();
        return users;
    }

    async getUserById(userId) {
        const users = this.#getStorage();
        return users.find(user => String(user.id) === String(userId));
    }

    async updateUser(user) {
        const users = this.#getStorage();
        const userIndex = users.findIndex(u => String(u.id) === String(user.id));

        if (userIndex === -1) throw new Error(`User ${user.id} was not found`);

        users[userIndex] = { ...users[userIndex], ...user };
        this.#setStorage(users);

        return users[userIndex];
    }

    async addUser(user) {
        const users = this.#getStorage();
        if (users.some(existingUser => String(existingUser.id) === String(user.id))) return;
        this.#setStorage([user, ...users]);
    }

    #getStorage() {
        const data = sessionStorage.getItem(this.#storageKey);
        return data ? JSON.parse(data) : [];
    }

    #setStorage(data) {
        sessionStorage.setItem(this.#storageKey, JSON.stringify(data));
    }


}
