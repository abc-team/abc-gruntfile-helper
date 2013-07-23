/**
 * 与任务配置有关的一些公用方法
 */
var Path = require( 'path' );
var HTTP = require( 'http' );
var SPAWN_COUNT = 0;
var SPAWN_PENDING_LIST = [];

module.exports = {
    /**
     * 获取当前用户任务
     * @returns {*}
     */
    getTaskName: function(){
        // 0: none
        // 1: grunt
        // 2: task
        return process.argv[ 2 ];
    },

    /**
     * 1、对grunt.util.spawn的封装，添加一个 --child-grunt 标志，用于区分子进程
     * 2、同是只有4个子进程在运行
     * @param grunt
     * @param cfg
     * @param done
     * @param ready
     */
    spawn: function( grunt, cfg, done, ready ){

        var self = this;

        if( !cfg.args ){
            cfg.args = [];
        }

        cfg.args.push( '--child-grunt' );

        // 检查是否可以马上执行
        if( SPAWN_COUNT <= 3 ){
            SPAWN_COUNT++;
            var child = grunt.util.spawn( cfg, function(){
                process.nextTick(function(){
                    if( SPAWN_PENDING_LIST.length ){
                        var task = SPAWN_PENDING_LIST.shift();
                        self.spawn( grunt, task.cfg, task.done, task.ready );
                    }
                });

                SPAWN_COUNT--;
                done.apply( this, arguments );
            });

            ready && ready( child );
        }
        else {
            SPAWN_PENDING_LIST.push( {
                cfg: cfg,
                done: done,
                ready: ready
            });
        }
    },

    /**
     * 检查当前是否为子进程
     * @returns {boolean}
     */
    ifChildGrunt: function(){
        return process.argv.indexOf( '--child-grunt' ) >= 0;
    },

    /**
     * 获取最新的generator，并在grunt任务执行完毕之后执行
     * @param type
     */
    getlastest: function( type ){

        if( !this.ifChildGrunt() ){

            /**
             * 隔三天检查一次
             */
            if( (new Date).getDate() % 3 == 0 ){

                var pjson = require( Path.resolve( process.cwd(), 'package.json'));

                var options = {
                    hostname: 'registry.npmjs.org',
                    port: 80,
                    path: '/' + type + '?t=' + Date.now(),
                    method: 'GET'
                };

                var DATA = '';
                var latestVersion;
                var currentVersion = pjson.version;

                var req = HTTP.request(options, function(res) {
                    res.setEncoding('utf8');
                    res.on('data', function (chunk) {
                        DATA += chunk;
                    });

                    res.on( 'end', function(){

                        var r;
                        try {
                            r = JSON.parse(DATA);
                        } catch(ex) {
                            r = {};
                            console.log( '获取最新的版本信息失败' );
                            return;
                        }

                        latestVersion = r[ 'dist-tags' ].latest;
                    });
                });

                req.end();

                process.on( 'exit', function(){
                    if( latestVersion ){
                        if( latestVersion != currentVersion ){
                            console.log( '\n\033[1;32m=======================================================\033[0m\n' );
                            console.log( '\t当前版本：\033[1;35m' + currentVersion + '\033[0m，可用更新 \033[1;32m' + latestVersion + '\033[0m :' );
                            console.log( '\t>>> \033[1;33mnpm update ' + type + ' -g\033[0m' );
                            console.log( '\n\033[1;32m=======================================================\033[0m' );
                        }
                    }
                });
            }
        }
    }
};