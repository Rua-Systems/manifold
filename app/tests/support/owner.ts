/** Credentials of the owner that every test database is seeded with. Never real credentials. */
export const TEST_OWNER = {
	username: 'owner',
	email: 'owner@example.test',
	password: 'correct-horse-battery'
};

export const TEST_OWNER_VARIABLES = {
	OWNER_USERNAME: TEST_OWNER.username,
	OWNER_EMAIL: TEST_OWNER.email,
	OWNER_PASSWORD: TEST_OWNER.password
};
