const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    connectionLimit: 5
});
pool.getConnection().then((conn) => {
    conn.query(
        `CREATE TABLE IF NOT EXISTS users(
            id INT AUTO_INCREMENT,
            user VARCHAR(20),
            passhash VARCHAR(255),
            admin BOOL,
            PRIMARY KEY(id)
        );`);
    conn.query(
        `CREATE TABLE IF NOT EXISTS images(
            id INT AUTO_INCREMENT,
            name VARCHAR(20),
            views INT,
            alt VARCHAR(50),
            PRIMARY KEY(id)
        );`);
    conn.query(
        `CREATE TABLE IF NOT EXISTS comments(
            id INT AUTO_INCREMENT,
            comment VARCHAR(255),
            user INT,
            image INT,
            PRIMARY KEY (id),
            FOREIGN KEY (user) REFERENCES users(id),
            FOREIGN KEY (image) REFERENCES images(id)
        );`);
    conn.query(
        `CREATE TABLE IF NOT EXISTS image_ratings(
            user INT,
            image INT,
            rating INT,
            PRIMARY KEY (user, image),
            FOREIGN KEY (user) REFERENCES users(id),
            FOREIGN KEY (image) REFERENCES images(id)
        );`);
    console.log("Connected to database");
    conn.release();
}).catch((err) => {
    console.error("Failed to connect to database");
    console.error(err);
    process.exit(1);
});

/**
 * Create structures to represent database rows
 */
/** */
class User {
    constructor(row) {
        Object.defineProperty(this, "id", { writable: false, value: Number(row.id) });
        Object.defineProperty(this, "user", { writable: false, value: String(row.user) });
        Object.defineProperty(this, "passhash", { writable: false, value: String(row.passhash) });
        Object.defineProperty(this, "admin", { writable: false, value: Boolean(row.admin) });
    }
    toObject() {
        return {
            id: this.id,
            user: this.user,
            passhash: this.passhash,
            admin: this.admin
        }
    }
}
class Comment {
    constructor(row) {
        Object.defineProperty(this, "id", { writable: false, value: Number(row.id) });
        Object.defineProperty(this, "comment", { writable: false, value: String(row.comment) });
        Object.defineProperty(this, "user", { writable: false, value: Number(row.user) });
        Object.defineProperty(this, "image", { writable: false, value: Number(row.image) });
    }
    toObject() {
        return {
            id: this.id,
            comment: this.comment,
            user: this.user,
            image: this.image
        };
    }
}
class Image {
    constructor(row) {
        Object.defineProperty(this, "id", { writable: false, value: Number(row.id) });
        Object.defineProperty(this, "name", { writable: false, value: String(row.name) });
        Object.defineProperty(this, "views", { writable: true, value: Number(row.views) });
        Object.defineProperty(this, "alt", { writable: true, value: String(row.alt) });
    }
    toObject() {
        return {
            id: this.id,
            name: this.name,
            views: this.views,
            alt: this.alt
        };
    }
}
class ImageRating {
    constructor(row) {
        Object.defineProperty(this, "user", { writable: false, value: Number(row.user) });
        Object.defineProperty(this, "image", { writable: false, value: Number(row.image) });
        Object.defineProperty(this, "rating", { writable: true, value: Number(row.rating) });
    }
    toObject() {
        return {
            user: this.user,
            image: this.image,
            rating: this.rating
        };
    }
}

/**
 * @param {String} sql
 * @param {any[]} data
 * @returns {Promise<any[]>}
 */
async function query(sql, data = []) {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute(sql, data);
    conn.release();
    return rows;
}

/**
 * @param {Number} id
 * @returns {Promise<User?>}
 */
async function getUserById(id) {
    const users = await query("SELECT * FROM users WHERE id = ?;", [id]);
    if (!users.length)
        return null;
    return new User(users[0]);
}
/**
 * @param {String} username
 * @returns {Promise<User?>}
 */
async function getUserByUsername(username) {
    const users = await query("SELECT * FROM users WHERE user = ?;", [username]);
    if (!users.length)
        return null;
    return new User(users[0]);
}
/**
 * @param {object} user
 * @param {string} user.user
 * @param {string} user.passhash
 * @param {Number|Boolean} user.admin
 */
async function insertUser(user) {
    // cast user.admin to bool then to number to ensure it is either 0 or 1
    await query("INSERT INTO users (user, passhash, admin) VALUES (?, ?, ?);", [user.user, user.passhash, Number(Boolean(user.admin))]);
}

/**
 * @param {Number} imageId
 * @returns {Promise<Comment[]?>}
 */
async function getCommentsForImage(imageId) {
    const comments = await query("SELECT * FROM comments WHERE image = ?;", [imageId]);
    if (!comments.length)
        return null;
    return Array.from(comments).map((row) => { return new Comment(row); });
}
/**
 * @param {object} comment
 * @param {string} comment.comment
 * @param {string} comment.user
 * @param {Number} comment.image
 */
async function insertComment(comment) {
    await query("INSERT INTO comments (comment, user, image) VALUES (?, ?, ?);", [comment.comment, comment.user, comment.image]);
}

/**
 * @returns {Promise<Image[]?>}
 */
async function getImages() {
    const images = await query("SELECT * FROM images;");
    if (!images.length)
        return null;
    return Array.from(images).map((row) => { return new Image(row); });
}
/**
 * 
 * @param {Number} id 
 * @returns {Promise<Image?>}
 */
async function getImage(id) {
    const images = await query("SELECT * FROM images WHERE id = ?", [id]);
    if (!images.length)
        return null;
    return new Image(images[0]);
}
/**
 * @param {object} image
 * @param {String} image.name
 * @param {Number} image.views
 * @param {String} image.alt
 */
async function insertImage(image) {
    await query("INSERT INTO images (name, views, alt) VALUES (?, ?, ?);", [image.name, image.views, image.alt]);
}
/**
 * @param {object} image
 * @param {Number} image.id
 * @param {String} image.name
 * @param {Number} image.views
 * @param {String} image.alt
 */
async function updateImage(image) {
    await query("UPDATE images SET views = ?, alt = ? WHERE id = ?", [image.views, image.alt, image.id]);
}
/**
 * @param {Number} imageId
 */
async function deleteImage(imageId) {
    await query("DELETE FROM images WHERE id = ?", [imageId]);
}

/**
 * @param {Number} imageId
 * @returns {Promise<Number?>}
 */
async function getAverageRatingForImage(imageId) {
    const ratings = await query("SELECT * FROM image_ratings WHERE image = ?", [imageId]);
    let rating = 0;
    for (const r of ratings)
        rating += new ImageRating(r).rating;
    if (rating > 0)
        rating = (rating / ratings.length).toFixed(1);
    // null will be used for unrated
    return rating > 0 ? rating : null;
}
/**
 * @param {object} rating
 * @param {Number} rating.user
 * @param {Number} rating.image
 * @returns {Promise<ImageRating?>}
 */
async function getRatingForUserImage(rating) {
    const ratings = await query("SELECT * FROM image_ratings WHERE image = ? AND user = ?", [rating.image, rating.user]);
    if (!ratings.length)
        return null;
    return new ImageRating(ratings[0]);
}
/**
 * @param {object} rating
 * @param {Number} rating.user
 * @param {Number} rating.image
 * @param {Number} rating.rating
 */
async function insertRating(rating) {
    await query("INSERT INTO image_ratings (user, image, rating) VALUES (?, ?, ?);", [rating.user, rating.image, rating.rating]);
}
/**
 * @param {object} rating
 * @param {Number} rating.user
 * @param {Number} rating.image
 * @param {Number} rating.rating
 */
async function updateRating(rating) {
    await query("UPDATE image_ratings SET rating = ? WHERE user = ? AND image = ?", [rating.rating, rating.user, rating.image]);
}

module.exports = {
    // comment exports
    getCommentsForImage,
    insertComment,

    // user exports
    getUserById,
    getUserByUsername,
    insertUser,

    // image exports
    getImages,
    getImage,
    insertImage,
    updateImage,
    deleteImage,

    // ratings
    getAverageRatingForImage,
    getRatingForUserImage,
    insertRating,
    updateRating
};
