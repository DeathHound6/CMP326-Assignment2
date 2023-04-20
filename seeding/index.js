const { readFileSync } = require("fs");
const bcrypt = require("bcrypt");

const db = require("../db.js");

// users
// regex used is for splitting by new line characters present
// slice used to remove column labels on file line 1
console.log("Seeding users");
const usersCSV = readFileSync(`${__dirname}/users.csv`).toString().split(/(\\r)?(\\n)?/g).slice(1);
for(const line of usersCSV) {
    const [username, password, admin] = line.split(",");
    db.insertUser({
        user: username,
        passhash: bcrypt.hashSync(password, bcrypt.genSaltSync()),
        admin: Number(Boolean(admin))
    });
}

// images
// regex used is for splitting by new line characters present
// slice used to remove column labels on file line 1
console.log("Seeding images");
const imagesCSV = readFileSync(`${__dirname}/images.csv`).toString().split(/(\\r)?(\\n)?/g).slice(1);
for(const line of imagesCSV) {
    const [id, name, views, alt] = line.split(",");
    db.insertImage({
        id: Number(id),
        name,
        views: Number(views),
        alt
    });
}

console.log("Seeding finished");