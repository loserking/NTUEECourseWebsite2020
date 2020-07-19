const uuid = require("node-uuid");
const express = require("express");
const session = require("express-session");
const asyncHandler = require("express-async-handler");
const redis = require("redis");
const connectRedis = require("connect-redis");
const bcrypt = require("bcrypt");
const debug = require("debug")("ntuee-course:api");
const deprecate = require("depd")("ntuee-course:api");

const constants = require("../constants.json");
const model = require("../database/model");

// ========================================

const router = express.Router();

// ========================================
// Date verification middleware

function createDate(spec) {
  const { year, month, day, hour, minutes } = spec;
  // month is 0 ~ 11, so we need to minus it by 1
  return new Date(year, month - 1, day, hour, minutes);
}

const startTime = createDate(constants.openTime.start);
const endTime = createDate(constants.openTime.end);

router.use((req, res, next) => {
  const now = new Date();
  console.log(now);
  console.log(startTime);
  console.log(endTime);
  if (now < startTime || now > endTime) {
    res.status(503).end();
    return;
  }
  next();
});

// ========================================
// Session middleware

const sessionOptions = {
  cookie: {
    path: "/",
    httpOnly: true,
    secure: false,
    maxAge: null,
  },
  resave: false,
  saveUninitialized: false,
  secret: uuid.v4(),
  unset: "destroy",
};

console.log("Secret:", sessionOptions.secret);
if (process.env.NODE_ENV === "production") {
  const RedisStore = connectRedis(session);
  const redisClient = redis.createClient(6379, constants.redisHost);
  redisClient.on("error", console.error);
  sessionOptions.store = new RedisStore({
    client: redisClient,
    prefix: "ntuee-course-session:",
  });

  // clear all sessions in redis
  sessionOptions.store.clear();

  console.log("Running in production mode!");
  sessionOptions.cookie.secure = true; // Need https
  if (!sessionOptions.cookie.secure) {
    deprecate("Recommend to set secure cookie session if has https!\n");
  }
}

router.use(session(sessionOptions));

// ========================================

router
  .route("/session")
  .get(
    asyncHandler(async (req, res, next) => {
      if (!req.session.userID) {
        res.status(403).end();
        return;
      }
      res.send({ userID: req.session.userID });
    })
  )
  .post(
    express.urlencoded({ extended: false }),
    asyncHandler(async (req, res, next) => {
      let { userID } = req.body;
      const { password } = req.body;

      if (!userID || !password) {
        res.status(400).end();
        return;
      }
      userID = userID.toUpperCase();

      const user = await model.Student.findOne({ userID }, "password").exec();
      if (!user) {
        res.status(400).end();
        return;
      }
      const passwordHash = user.password;

      // Check password with the passwordHash
      const match = await bcrypt.compare(password, passwordHash);
      if (!match) {
        res.status(401).end();
        return;
      }

      req.session.userID = userID;
      res.status(201).send({ userID });
    })
  )
  .delete(
    asyncHandler(async (req, res, next) => {
      req.session = null;
      res.status(204).end();
    })
  );

router.get(
  "/courses",
  asyncHandler(async (req, res, next) => {
    if (!req.session.userID) {
      res.status(403).end();
      return;
    }

    const coursesGroup = await model.Course.aggregate([
      {
        $group: {
          _id: "$type",
          courses: { $push: { courseID: "$id", name: "$name" } },
        },
      },
    ]);

    const data = {};
    coursesGroup.forEach((group) => {
      /* eslint-disable-next-line no-underscore-dangle */
      data[group._id] = group.courses;
    });

    res.send(data);
  })
);

router
  .route("/selections/:courseID")
  .all(
    asyncHandler(async (req, res, next) => {
      if (!req.session.userID) {
        res.status(403).end();
        return;
      }
      const { courseID } = req.params;
      const course = await model.Course.findOne(
        { id: courseID },
        "name type description options"
      );
      if (!course) {
        res.sendStatus(404);
        return;
      }
      req.course = course;
      next();
    })
  )
  .get(
    asyncHandler(async (req, res, next) => {
      const { courseID } = req.params;
      const { userID } = req.session;
      const { name, type, description, options } = req.course;
      const user = await model.Student.findOne({ userID }, "selections");
      const { selections } = user;
      const selected = selections[courseID];
      const unselected = options.filter((option) => !selected.includes(option));
      res.send({ name, type, description, selected, unselected });
    })
  )
  .put(
    express.json({ strict: false }),
    asyncHandler(async (req, res, next) => {
      const { userID } = req.session;
      const { courseID } = req.params;
      const { options } = req.course;

      // Validation
      if (!Array.isArray(req.body)) {
        res.status(400).end();
        return;
      }
      if (!req.body.every((option) => options.includes(option))) {
        res.status(400).end();
        return;
      }

      const update = {};
      update[`selections.${courseID}`] = req.body;
      const result = await model.Student.updateOne({ userID }, update);
      res.status(204).end();
    })
  );

export default router;
