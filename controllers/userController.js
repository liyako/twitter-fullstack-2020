const { User, Reply, Tweet, Like, Followship, Message, Privatechat } = require('../models')
const bcrypt = require('bcrypt-nodejs')
const { Op } = require('sequelize')
const sequelize = require('sequelize')
const helpers = require('../_helpers')
const imgur = require('imgur-node-api')

const userController = {
  registerPage: (req, res) => {
    return res.render('register')
  },

  register: (req, res) => {
    const { account, name, email, password, checkPassword } = req.body

    const errors = []

    if (!account || !name || !email || !password || !checkPassword) {
      errors.push({ message: '所有欄位都是必填。' })
    }
    if (password !== checkPassword) {
      errors.push({ message: '密碼與確認密碼不相符！' })
    }
    if (errors.length) {
      return res.render('register', {
        errors,
        account,
        name,
        email,
        password,
        checkPassword
      })
    }

    User.findOne({
      where: {
        [Op.or]: [
          { email },
          { account }
        ]
      }
    })
      .then(user => {
        if (user) {
          req.flash('error_messages', '信箱或是帳號重複！')
          return res.redirect('/signup')
        }
        User.create({
          account,
          name,
          email,
          password: bcrypt.hashSync(password, bcrypt.genSaltSync(10), null)
        }).then(user => {
          return res.redirect('/signin')
        })
      })
  },

  signInPage: (req, res) => {
    return res.render('signin')
  },

  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/tweets')
  },

  logout: (req, res) => {
    req.flash('success_messages', '登出成功！')
    req.logout()
    res.redirect('/signin')
  },
  getUserTweets: (req, res) => {
    User.findByPk(req.params.id, {
      include: [
        //使用者Like過的所有推文
        { model: Like, include: [Tweet] },
        //使用者的推文包括推文的回覆、喜歡、使用者資訊
        {
          model: Tweet,
          limit: 10,
          order: [["createdAt", "DESC"]],
          include: [Reply, Like, User]
        },
        // 使用者的追蹤者
        { model: User, as: "Followers" },
        // 使用者追蹤的人
        { model: User, as: "Followings" },
        {
          model: Tweet, as: 'LikedTweets',
          order: [["createdAt", "DESC"]],
          include: [User]
        },
        { model: Tweet, as: 'ReplyTweet', include: [User] }
      ]
    })
      .then((user) => {
        user = {
          ...user.dataValues,
          LikeCount: user.Likes.length,
          TweetCount: user.Tweets.length,
          FollowerCount: user.Followers.length,
          FollowingCount: user.Followings.length,
          isFollowing: helpers.getUser(req).Followings.map(d => d.id).includes(user.id)
        }
        const tweets = user.Tweets.map((tweet) => ({
          ...tweet.dataValues,
          LikeCount: tweet.dataValues.Likes.length,
          ReplyCount: tweet.dataValues.Replies.length,
          isLiked: tweet.dataValues.Likes.map(d => d.UserId).includes(helpers.getUser(req).id)
        }))
        res.render('userTweets', { profile: user, tweets })
      })
  },
  getSetting: async (req, res) => {
    const user = await User.findByPk(req.params.id)
    if (user.id === helpers.getUser(req).id) {
      return res.render('userSetting', {
        account: user.toJSON().account,
        name: user.toJSON().name,
        email: user.toJSON().email,
        css: 'settingPage'
      })
    } else {
      req.flash('error_messages', '不能修改別人的資料')
      return res.redirect('/tweets')
    }
  },
  putSetting: async (req, res) => {
    const { account, name, email, password, checkPassword } = req.body
    const errors = []
    if (!account || !name || !email || !password || !checkPassword) {
      errors.push({ message: '所有欄位都是必填。' })
    }
    if (password !== checkPassword) {
      errors.push({ message: '密碼與確認密碼不相符！' })
    }
    if (errors.length) {
      return res.render('userSetting', {
        errors,
        account,
        name,
        email,
        password,
        checkPassword,
        css: 'settingPage'
      })
    }
    const user = await User.findByPk(req.params.id)
    if (user.id === helpers.getUser(req).id) {
      const duplicatedUser = await User.findOne({
        where: {
          [Op.or]: [
            { email },
            { account }
          ],
          id: {
            [Op.ne]: user.id
          }
        }
      })
      if (duplicatedUser) {
        errors.push({ message: '重複的帳號或email' })
        return res.render('userSetting', {
          account,
          name,
          email,
          password,
          checkPassword,
          errors,
          css: 'settingPage'
        })
      }

      await user.update({
        account,
        name,
        email,
        password: bcrypt.hashSync(password, bcrypt.genSaltSync(10), null),
        checkPassword
      })
      req.flash('success_messages', 'setting was successfully to update')
      return res.redirect(`/setting/${user.id}`)
    } else {
      req.flash('error_messages', '不能修改別人的資料')
      return res.redirect('/tweets')
    }
  },
  putUser: (req, res) => {
    const uploadImg = (filePath) => {
      return new Promise((resolve, reject) => {
        imgur.setClientID(process.env.IMGUR_CLIENT_ID)
        if (filePath) {
          imgur.upload(filePath, (err, img) => {
            if (err) reject(err)
            resolve(img)
          })
        } else {
          reject(Error, "file doesn't exist.")
        }
      })
    }
    const { files } = req
    if ((Object.keys(files).length === 0)) {
      return User.findByPk(req.params.id).then((user) => {
        user
          .update({
            name: req.body.name,
            introduction: req.body.introduction,
            cover: user.cover,
            avatar: user.avatar
          })
          .then((user) => {
            req.flash('success_message', 'User successfully update')
            res.redirect(`/users/${req.params.id}/tweets`)
          })
      })
    } else if ((Object.keys(files).length === 2)) {
      uploadImg(files.cover[0].path).then((cover) => {
        uploadImg(files.avatar[0].path).then((avatar) => {
          return User.findByPk(req.params.id).then((user) => {
            user.update({
              name: req.body.name,
              introduction: req.body.introduction,
              cover: cover.data.link,
              avatar: avatar.data.link
            })
          })
        })
      })
        .then(() => {
          req.flash('success_message', 'User successfully update')
          res.redirect(`/users/${req.params.id}/tweets`)
        })
    } else {
      if (files.cover) {
        uploadImg(files.cover[0].path).then((cover) => {
          return User.findByPk(req.params.id).then((user) => {
            user.update({
              name: req.body.name,
              introduction: req.body.introduction,
              cover: cover.data.link,
              avatar: user.avatar
            })
          })
        })
          .then(() => {
            req.flash('success_message', 'User successfully update')
            res.redirect(`/users/${req.params.id}/tweets`)
          })
      }
      if (files.avatar) {
        uploadImg(files.avatar[0].path).then((avatar) => {
          return User.findByPk(req.params.id).then((user) => {
            user.update({
              name: req.body.name,
              introduction: req.body.introduction,
              cover: user.cover,
              avatar: avatar.data.link
            })
          })
        })
          .then(() => {
            req.flash('success_message', 'User successfully update')
            res.redirect(`/users/${req.params.id}/tweets`)
          })
      }
    }
  },
  addFollowing: (req, res) => {
    if (helpers.getUser(req).id === Number(req.body.id)) {
      return res.send('can not follow self')
    }
    return Followship.create({
      followerId: helpers.getUser(req).id,
      followingId: Number(req.body.id)
    }).then(followship => {
      res.redirect('back')
    })
  },
  removeFollowing: (req, res) => {
    return Followship.findOne({
      where: {
        followerId: helpers.getUser(req).id,
        followingId: req.params.followingId
      }
    }).then(followship => {
      followship.destroy().then(followship => {
        return res.redirect('back')
      })
    })
  },
  getFollower: (req, res) => {
    return User.findByPk(req.params.id, {
      include: [{ model: User, as: 'Followers' }, { model: Tweet }]
    }).then((user) => {
      const results = user
      results.Followers = user.Followers.map((follower) => ({
        ...follower.dataValues,
        isFollowed: helpers.getUser(req).Followings.map(d => d.id).includes(
          follower.id
        )
      }))
      results.tweetCount = user.Tweets.length
      results.Followers.sort((a, b) => b.Followship.createdAt - a.Followship.createdAt)
      res.render('followers', { results: results })
    })
      .catch((err) => res.send(err))
  },
  getFollowing: (req, res) => {
    return User.findByPk(req.params.id, {
      include: [{ model: User, as: 'Followings' }, { model: Tweet }]
    })
      .then((user) => {
        const results = user
        results.Followings = user.Followings.map((following) => ({
          ...following.dataValues,
          isFollowed: helpers.getUser(req).Followings.map(d => d.id).includes(
            following.id
          )
        }))
        results.Followings.sort((a, b) => b.Followship.createdAt - a.Followship.createdAt)
        res.render('followings', { results: results })
      })
  },
  getTopUsers: (req, res, next) => {
    return User.findAll({
      include: [{ model: User, as: 'Followers' }]
    })
      .then((users) => {
        users = users.map((user) => ({
          ...user.dataValues,
          followerCount: user.Followers.length,
          isFollowed: user.Followers.map(d => d.id).includes(helpers.getUser(req).id)
        }))
        users = users.filter(user => user.name !== helpers.getUser(req).name && (!user.isAdmin))
        users = users
          .sort((a, b) => b.followerCount - a.followerCount)
          .slice(0, 10)
        res.locals.topUsers = users
        return next()
      })
  },
  getChatroom: async (req, res) => {
    const messages = await Message.findAll({
      raw: true,
      nest: true,
      include: [User],
      order: [["createdAt", "ASC"]]
    })
    return res.render('chatroom', { messages })
  },
  getPrivateChat: async (req, res) => {
    const relativeId = req.params.id
    let relativeUser = await User.findByPk(relativeId)
    relativeUser = relativeUser.toJSON()
    const messages = await Privatechat.findAll({
      raw: true,
      nest: true,
      where: {
        UserId: [req.user.id, relativeId],
        relativeId: [req.user.id, relativeId]
      },
      order: [["createdAt", "ASC"]]
    })

    let listMessage = await Privatechat.findAll({
      raw: true,
      nest: true,
      where: {
        [Op.or]: [{ UserId: req.user.id }, { relativeId: req.user.id }]
      },
      order: [["id", "DESC"]]
    })

    const newListMessage = []
    for (let i = 0; i < listMessage.length; i++) {
      if (listMessage[i].UserId === req.user.id) {
        if (!newListMessage.find(e => (e.id === listMessage[i].relativeId))) {
          newListMessage.push({ id: listMessage[i].relativeId, createdAt: listMessage[i].createdAt, text: listMessage[i].text })
        }
      } else {
        if (!newListMessage.find(e => (e.id === listMessage[i].UserId))) {
          newListMessage.push({ id: listMessage[i].UserId, createdAt: listMessage[i].createdAt, text: listMessage[i].text })
        }
      }
    }

    for (let i = 0; i < newListMessage.length; i++) {
      let user = await User.findByPk(newListMessage[i].id)
      user = user.toJSON()
      newListMessage[i].name = user.name
      newListMessage[i].avatar = user.avatar
    }

    return res.render('privateChat', { relativeId, relativeName: relativeUser.name, messages, relativeAvatar: relativeUser.avatar, newListMessage })
  }
}

module.exports = userController
