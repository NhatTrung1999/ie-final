const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const existing = await prisma.user.findFirst({
    where: {
      username: {
        in: ['admin', 'administrator'],
      },
    },
    orderBy: {
      username: 'asc',
    },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        username: 'admin',
        passwordHash: hashPassword('test'),
        displayName: 'Admin',
      },
    });
    return;
  }

  await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: hashPassword('test'),
      displayName: 'Admin',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
