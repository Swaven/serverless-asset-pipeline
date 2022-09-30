'use strict'

const glob  = require('glob'),
      path = require('path'),
      fs = require('fs/promises'),
      mkdirp = require('mkdirp'),
      rimraf = require('rimraf'),
      {minify:compressJS} = require('terser'),
      cleanCss = require('clean-css')


module.exports = class AssetPipelinePlugin {
  constructor(serverless, cliOptions, {log}){
    this.serverless = serverless
    this.log = log
    this.tasks = null
    this.funcName = ''
    this.stage = ''

    this.settings = {
      minify: {
        stages: ['staging', 'prod']
      }
    }

    this.cssMinifier = new cleanCss({
      level: {
        1: {
          all: true,
          removeQuotes: false
        }
      }
    })

    if  (cliOptions?.function)
      this.funcName = cliOptions.function
    if (cliOptions?.stage)
      this.stage = cliOptions.stage

    this.hooks = {
      initialize: () => this.init(),

      // deploy -f
      'before:package:function:package': () => this.run(),
      
      // sls offline
      'before:offline:start': () => this.run(),

      // local invoke & global deploy
      'before:package:cleanup': () => this.run()
    }
  }

  // hook handler
  run(){

    // find which function to process
    const functions = this.funcName ? [this.funcName] : Object.keys(this.serverless.service.functions)

    const globOpts = {nodir: true}

    this.log.verbose("[sap] stage:" + this.stage)

    functions.forEach(async name => {
      const cfg = this.tasks[name]
      
      if (!cfg) {
        this.log.verbose('[sap] ignore function ' + name)
        return
      }

      let prefix = cfg.src.substring(0, cfg.src.indexOf('*'))
      
      try{
        const p = new Promise((resolve, reject) => {
          // get list of paths for files to process
          glob(cfg.src,globOpts, (err, files) =>{
            if (err)
              return reject(err)
            resolve(files)
          })
        })

        const files = await p
        this.log.debug("files", files)
        files.forEach(f => this.processFile(f, cfg))

      }
      catch(ex){
        this.log.error('[sap] ERROR ' + ex.message)
        this.log.verbose(ex)
      }
    })
  }

  // copies and optionally transforms the file
  async processFile(filepath, cfg){
    const ext = filepath.match(/\.\w+$/)[0]
    const content = await fs.readFile(filepath)
    const outPath = path.join(cfg.dest, filepath.replace(cfg.srcPrefix, ''))
    let output

    if (!this.settings.minify.stages.includes(this.stage)){
      output = content // copy as-is
      this.log.verbose('[sap] passthrough ' + filepath)
    }
    else{ 
      switch(ext){
        case '.js':
          const res = await compressJS(content.toString('utf8'))
          output = res.code
          this.log.verbose('[sap] minify ' + filepath)
          break
        case '.css':
          output = this.cssMinifier.minify(content).styles
          this.log.verbose('[sap] minify ' + filepath)
          break
        default:
          output = content
          this.log.verbose('[sap] passthrough ' + filepath)
      }
    }

    const dir = path.dirname(outPath)
    await mkdirp(dir)
    await fs.writeFile(outPath, output)
  }

  async init(){
    this.log.verbose("[sap] init")

    if (!this.stage)
      this.stage = this.serverless.service.provider.stage

    this.tasks = {}

    const config = this.serverless.configurationInput.custom['serverless-asset-pipeline']
    const rmp = []

    Object.entries(config.tasks).forEach(([name, cfg]) => {
      // delete destination folder
      rmp.push(new Promise((resolve, reject)=>{
        rimraf(cfg.dest, err => {
          if (err)
            reject(er)
          else
            resolve()
        })
      }))

      // add new task from serverless.yml
      this.tasks[name] = {
        ...cfg,
        srcPrefix: cfg.src.substring(0, cfg.src.indexOf('*'))
      }
    })

    // override default settings
    if (config.minify){
      this.settings.minify = {
        ...this.settings.minify,
        ...config.minify
      }
    }

    await Promise.all(rmp) // await deletion 
    this.log.verbose(this.tasks)
    this.log.verbose(this.settings)
  }
}

