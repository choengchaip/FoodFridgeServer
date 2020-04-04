const express = require('express')
const schedule = require('node-schedule')
const app = express()
const admin = require('firebase-admin')
const serviceAccount = require('./adminData.json')
const axios = require('axios')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://foodfridge-18df3.firebaseio.com'
})

const firestore = admin.firestore()

const calculateIngredient = async function () {
  let differentDays = null
  let toMessage = []
  await firestore.collection('Fridge').get().then((docs) => {
    docs.docs.forEach((d) => {
      if (d.data().date != null && d.data().uid != null) {
        differentDays = Math.ceil((d.data().date.toDate().getTime() - new Date().getTime()) / (1000 * 3600 * 24))
        if (differentDays < 3 && differentDays > 0) {
          toMessage = [
            ...toMessage,
            {
              uid: d.data().uid,
              name: d.data().name,
              expireIn: differentDays
            }
          ]
        }
      }
    })
  })

  await firestore.collection('User').get().then((docs) => {
    docs.docs.forEach((d) => {
      for (let i = 0; i < toMessage.length; i++) {
        if(toMessage[i].uid === d.data().uid){
          let message_title = `เร็วเข้า !!`
          let message_body = `${toMessage[i].name} ในตู้เย็นของคุณ จะหมดอายุใน ${toMessage[i].expireIn} วัน !!`

          toMessage[i] = {
            ...toMessage[i],
            message_token: d.data().message_token,
            message_title: message_title,
            message_body: message_body
          }
        }
      }
    })
  })

  for (let i = 0; i < toMessage.length; i++) {
    await firestore.collection('Notification').add({
      uid: toMessage[i].uid,
      ingredient_name: toMessage[i].name,
      expireIn: toMessage[i].expireIn,
      created_at: new Date().getTime(),
      is_read: false
    })
  }

  for (let i = 0; i < toMessage.length; i++) {
    let body = {
      'message_payload': {
        'notification': {
          'title': toMessage[i].message_title,
          'body': toMessage[i].message_body
        },
        'data': {
          'click_action': 'FLUTTER_NOTIFICATION_CLICK',
          'status': 'done',
          "id": "1",
        }
      },
      'priority': 'high',
      'target': toMessage[i].message_token
    }

    await axios.post('https://asia-east2-foodfridge-18df3.cloudfunctions.net/sendNotification', body, {headers: { 'Content-Type': 'application/json'}})
  }

  console.log('Done!!!')
}

app.listen(8082, () => {
  console.log('Server is running')

  var j = schedule.scheduleJob('10 * * * * *', calculateIngredient)
})
