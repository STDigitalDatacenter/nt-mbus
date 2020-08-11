// require('dotenv').config()
const util = require('util')
const snmp = require('net-snmp')
const MbusMaster = require('node-mbus')
const fs = require('fs')

const createSnmpServer = () => {
  const options = {
    port: 161,
    retries: 1,
    timeout: 5000,
    backoff: 1.0,
    transport: 'udp4',
    trapPort: 162,
    version: snmp.Version1,
    backwardsGetNexts: true,
    idBitsSize: 32,
  }

  const session = snmp.createSession('127.0.0.1', 'public', options)
}

const getInventory = () => {
  const rawdata = fs.readFileSync(`${__dirname}/../inventory.json`)
  const mbus = JSON.parse(rawdata)
  return mbus
}

const mbusInit = (host, port = 1234) => {
  const mbusOptions = {
    host: host,
    port: port,
    timeout: 2000,
    autoConnect: false,
  }
  let mbusMaster
  mbusMaster = new MbusMaster(mbusOptions)

  mbusMaster.connect()
  if (!mbusMaster.connect()) {
    mbusOptions.port = 1470
    mbusMaster = new MbusMaster(mbusOptions)
    mbusMaster.connect()
    if (!mbusMaster.connect()) {
      console.error('Connection failed.')
      return false
    }
  } else {
    console.log(mbusMaster)
  }

  return mbusMaster
}

const mbusScan = master => {
  // const scan = util.promisify(master.scanSecondary)
  // const data = await scan()
  // console.log(data)

  return master.scanSecondary((err, scanResult) => {
    if (err) {
      console.log('err: ' + err)
      return false
    }
    console.log(scanResult)
    return scanResult
  })
}

const mbusQuery = (master, id, callback) => {
  master.getData(id, (err, data) => {
    if (err) {
      console.log('err: ' + err)
      return false
    }
    // console.log('data: ' + JSON.stringify(data, null, 2))
    callback(data)
    return data
  })
}

createSnmpServer()
const mbus = getInventory()

mbus.convertors.forEach((conv, i) => {
  if (conv === '172.16.60.58') {
    const master = mbusInit(conv, 1234)
    let data = mbusScan(master)
    // console.log(data)
    // mbusQuery(master, '08781934523B0002', function (data, err) {
    //   if (data) {
    //     console.log(data.DataRecord[0])
    //     console.log(data.DataRecord[0].Value)
    //   }
    // })
    // master.close()
  }
})
