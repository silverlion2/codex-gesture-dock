'use strict'

function configureSmokeRuntime(app) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

module.exports = { configureSmokeRuntime }
