# serverless-asset-pipeline

A serverless plugin to minify or copy (passthrough) static assets.

## Config

declare plugin in serverless.yml, and add a config like

````yml
custom:
  serverless-asset-pipeline:
      minify:
        stages: ['dev'] # optional, overrides the default ['staging', 'prod]
      tasks: # mandatory, tells plugin what & where
        generator: # name of the function 
          src: generator/assets/** # glob to asset files
          dest: bin/generator/assets/ # where to output them
        # add other functions below
````


## Dependencies
 see [package.json](./package.json)