require("dotenv").config({ path: `${__dirname}/.env` });

const express = require("express");

const controller = require("./controller");

const app = express();

app.set("views", "views");
app.set("view engine", "ejs");
app.engine("ejs", require("ejs").renderFile);
// register all middlewares
for (const middleware of controller.middlewares) app.use(...middleware);
app.listen(process.env.PORT, () => {
    console.log(`Listening at http://localhost:${process.env.PORT}`);
});

app.get("/", ...controller.getAppRoot);
app.get("/upload", ...controller.getAppUpload);
app.post("/upload", ...controller.postAppUpload);
app.get("/auth/login", ...controller.getAuthLogin);
app.post("/auth/login", ...controller.postAuthLogin);
app.get("/auth/signup", ...controller.getAuthSignup);
app.post("/auth/signup", ...controller.postAuthSignup);
app.get("/auth/logout", ...controller.getAuthLogout);
app.get("/:image", ...controller.getAppImage);
app.post("/:image/comments", ...controller.postAppImageComments);