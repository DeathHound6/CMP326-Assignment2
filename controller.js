const passport = require("passport"),
    { Strategy } = require("passport-local"),
    bcrypt = require("bcrypt"),
    { static, json, urlencoded } = require("express"),
    session = require("express-session"),
    multer = require("multer")(),
    MemoryStore = require("memorystore")(session),
    { writeFileSync, rmSync } = require("fs");

const db = require("./db.js");

function render(req, res, view, data = {}, statusCode = 200) {
    const ejsData = Object.assign({
        user: req.user || null,
        error: req.session?.messages && 0 in req.session.messages ? req.session.messages[0].message : req.session?.error || null
    }, data);
    // remove the data from the session after it's loaded into ejsData
    // this will prevent these errors being displayed on the UI after the page is refreshed
    delete req.session?.error;
    res.status(statusCode).render(view, ejsData);
}
function generateImageName() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let filename = "";
    // generate random number between 4 and 15 for length of filename
    // max 15 chars to make room for file extension in db too (db stored 20 max chars)
    const max = 15;
    const min = 4;
    for (let i = 0; i < Math.floor(Math.random() * (max - min + 1)) + min; i++)
        // select random character
        filename += chars[Math.floor(Math.random() * chars.length)];
    return filename;
}

passport.serializeUser(function(user, done) {
    done(null, user);
});
passport.deserializeUser(function(user, done) {
    done(null, user);
});
passport.use(
    new Strategy(
        async function(username, password, done) {
            const user = await db.getUserByUsername(username);
            if (!user)
                return done("Invalid username or password", null);
            if (bcrypt.compareSync(password, user.passhash))
                return done(null, user.toObject());
            done("Invalid username or password", null);
        }
    )
);

// create the middlewares as an array so that they can all be registered dynamically
exports.middlewares = [
    // middleware to parse different body content types
    [
        json()
    ],
    [
        urlencoded({ extended: true })
    ],
    // register sessions
    [
        session({
            secret: "my-session_secret",
            store: new MemoryStore(),
            resave: false,
            saveUninitialized: true,
            unset: "destroy"
        })
    ],
    [
        passport.initialize()
    ],
    [
        passport.session()
    ],
    // middleware to register the /public folder as an endpoint
    [
        "/public",
        static(`${__dirname}/public`)
    ],
    // middleware to log request info
    // [
    //     "/",
    //     (req, _, next) => {
    //         console.log("-------------------------");
    //         console.log("   Request Information   ");
    //         console.log("-------------------------");
    //         console.log(`Request: ${req.method} ${req.protocol}://${req.hostname}:${process.env.PORT}${req.originalUrl}`);
    //         // `::ffff:` is present in the localhost ip -> remove it when logging
    //         console.log(`IP Address: ${req.ip.replace("::ffff:", "")}`);
    //         console.log(`Body: ${JSON.stringify(req.body)}`);
    //         console.log(`Headers: ${JSON.stringify(req.headers)}`);
    //         console.log("");
    //         next();
    //     }
    // ]
];

exports.getAppRoot = [
    async(req, res) => {
        const images = await db.getImages() || [];
        const ratings = {};
        for (const image of images)
            ratings[image.id] = await db.getAverageRatingForImage(image.id);
        render(req, res, "gallery.ejs", { images, ratings });

    }
];

exports.getAppUpload = [
    (req, res) => {
        if (!req.user)
            return res.status(401).redirect("/auth/login");
        render(req, res, "upload.ejs", {});
    }
];
exports.postAppUpload =  [
    multer.single("image"),
    async(req, res) => {
        if (!req.user)
            return res.status(401).redirect("/auth/login");
        if (!req.file?.buffer || !req.body.description) {
            req.session.error = "Ensure all fields are filled out";
            return res.status(400).redirect("/upload");
        }
        // generate random filename to prevent potential overlap of uploaded filenames
        // get the same file extension from the original filename - parts[parts.length-1]
        const parts = req.file.originalname.split(".");
        const name = `${generateImageName()}.${parts[parts.length-1]}`;
        await db.insertImage({
            name,
            views: 0,
            alt: req.body.description
        });
        writeFileSync(`${__dirname}/public/images/${name}`, req.file.buffer);
        res.status(200).redirect("/");
    }
];
exports.getAppImage = [
    async(req, res) => {
        const image = await db.getImage(Number(req.params.image));
        if (!image) {
            req.session.error = "No Image Found";
            return render(req, res, "image.ejs", { image }, 404);
        }
        image.views++;
        await db.updateImage(image);
        const comments = await db.getCommentsForImage(image.id) || [];
        const rating = await db.getAverageRatingForImage(image.id);
        render(req, res, "image.ejs", { image, comments, rating }, 200);
    }
];
exports.postAppImage = [
    async(req, res) => {
        if (!req.user?.admin)
            return res.status(401).redirect("/auth/login");
        const image = await db.getImage(Number(req.params.image));
        if (!image) {
            req.session.error = "No Image Found";
            return render(req, res, "image.ejs", { image }, 404);
        }
        if (!req.body.description) {
            req.session.error = "Ensure all fields are filled out";
            return res.status(400).redirect(`/${image.toObject().id}`);
        }
        image.alt = req.body.description;
        await db.updateImage(image);
        res.status(200).redirect(`/${image.toObject().id}`);
    }
];
exports.postAppImageRemove = [
    async(req, res) => {
        if (!req.user?.admin)
            return res.status(401).redirect("/auth/login");
        const image = await db.getImage(Number(req.params.image));
        if (!image) {
            req.session.error = "No Image Found";
            return render(req, res, "image.ejs", { image }, 404);
        }
        rmSync(`${__dirname}/public/images/${image.toObject().name}`);
        await db.deleteImage(image.toObject().id);
        res.status(200).redirect("/");
    }
];
exports.postAppImageComments = [
    async(req, res) => {
        if (!req.user)
            return res.status(401).redirect("/auth/login");
        const image = await db.getImage(Number(req.params.image));
        if (!image) {
            req.session.error = "No Image Found";
            return render(req, res, "image.ejs", { image }, 404);
        }
        await db.insertComment({
            comment: req.body.comment,
            user: req.user?.user,
            image: Number(req.params.image)
        });
        res.status(200).redirect(`/${req.params.image}`);
    }
];
exports.postAppImageRatings = [
    async(req, res) => {
        if (!req.user)
            return res.status(401).redirect("/auth/login");
        const user = await db.getUserById(Number(req.body.user));
        if (!user)
            return res.status(401).redirect("/auth/login");
        const image = await db.getImage(req.params.image);
        if (!image) {
            req.session.error = "No Image Found";
            return render(req, res, "image.ejs", { image }, 404);
        }
        const rating = await db.getRatingForUserImage({
            user: user.toObject().id,
            image: image.toObject().id
        });
        if (!rating) {
            await db.insertRating({
                user: user.toObject().id,
                image: image.toObject().id,
                rating: Number(req.body.rating)
            });
        } else {
            if (rating.toObject().rating != Number(req.body.rating))
                await db.updateRating({
                    user: user.toObject().id,
                    image: image.toObject().id,
                    rating: Number(req.body.rating)
                });
        }
        res.status(200).redirect(`/${image.toObject().id}`);
    }
];

exports.getAuthLogin = [
    (req, res) => {
        if (req.user)
            return res.status(302).redirect("/");
        render(req, res, "login.ejs", { mode: "login" });
    }
];
exports.postAuthLogin = [
    (req, res, next) => {
        if (req.user)
            return res.status(302).redirect("/");
        if (!req.body.username || !req.body.password) {
            req.session.error = "Ensure all fields are filled out";
            return res.status(400).redirect("/auth/login");
        }
        next();
    },
    passport.authenticate("local", { failureRedirect: "/auth/login", failureMessage: true, successReturnToOrRedirect: "/" })
];
exports.getAuthSignup = [
    (req, res) => {
        if (req.user)
            return res.status(302).redirect("/");
        render(req, res, "login.ejs", { mode: "signup" });
    }
];
exports.postAuthSignup = [
    async(req, res, next) => {
        if (req.user)
            return res.status(302).redirect("/");
        if (!req.body.username || !req.body.password || !req.body.passwordConfirm) {
            req.session.error = "Ensure all fields are filled out";
            return res.status(400).redirect("/auth/signup");
        }
        // set the error here in case the passport auth fails
        if (req.body.password != req.body.passwordConfirm) {
            req.session.error = "Passwords do not match";
            return res.status(400).redirect("/auth/signup");
        }
        const user = await db.getUserByUsername(req.body.username);
        if (user) {
            req.session.error = "Username already taken";
            return res.status(400).redirect("/auth/signup");
        }
        const hash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync());
        await db.insertUser({
            user: req.body.username,
            passhash: hash,
            admin: false
        });
        next();
    },
    passport.authenticate("local", { failureRedirect: "/auth/signup", failureMessage: true, successReturnToOrRedirect: "/" })
];
exports.getAuthLogout = [
    async(req, res) => {
        if (!req.user)
            return res.status(302).redirect("/");
        req.logOut((err) => {
            if (err)
                console.error(err);
        });
        res.status(200).redirect("/");
    }
];