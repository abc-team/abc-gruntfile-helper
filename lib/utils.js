/**
 * 与任务配置有关的一些公用方法
 */
var URL = require( 'url' );
var HTTP = require( 'http' );
var HTTPS = require( 'https' );
var SPAWN_COUNT = 0;
var SPAWN_PENDING_LIST = [];
var Child = require( 'child_process' );

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
        if( SPAWN_COUNT <= 3 || cfg.force ){
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

        var self = this;

        if( !this.ifChildGrunt() ){

            /**
             * 隔三天检查一次
             */
            if( (new Date).getDate() % 3 == 0 ){

                this.getCurrentVersion( type, function( err, v ){

                    if( err ){
                        console.log( '获取当前Generator版本出错: ', err, arguments[ 1 ], arguments[ 2 ]);
                    }
                    else {

                        if( !v ){
                            console.log( '获取当前Generator版本出错, 请检查你是否已经完成安装：\n\t\033[1;33m npm install ' + type  + ' -g \033[0m' );
                        }
                        else {
                            var options = {
                                hostname: 'registry.npmjs.org',
                                port: 80,
                                path: '/' + type + '?t=' + Date.now(),
                                method: 'GET'
                            };

                            var DATA = '';
                            var latestVersion;
                            var currentVersion = v;
                            var changelog;

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

                                    /**
                                     * 若有新版本，再试图抓取changelog
                                     * 注意，暂时只针对github类型
                                     */
                                    if( latestVersion != currentVersion ){

                                        self.getChangeLog(r.repository.url, latestVersion, function( err, log ){
                                            if( !err ){
                                                changelog = log;
                                            }
                                        });
                                    }
                                });
                            });

                            req.end();

                            process.on( 'exit', function(){
                                if( latestVersion ){
                                    if( latestVersion != currentVersion ){
                                        console.log( '\n\033[1;32m=======================================================\033[0m\n' );
                                        console.log( '\t当前版本：\033[1;35m' + currentVersion + '\033[0m，可用更新 \033[1;32m' + latestVersion + '\033[0m :' );
                                        console.log( '\t>>> \033[1;33mnpm update ' + type + ' -g\033[0m' );
                                        if( changelog ){
                                            console.log( '\n\t变更记录\033[40;37m(' + latestVersion + ')\033[0m：\n\t\t\033[40;37m' + changelog.replace( /\n/g, '\n\t\t' ) + '\033[0m' );
                                        }
                                        console.log( '\n\t安装完更新后进入到项目目录中应用变更:' );
                                        console.log( '\t>>> \033[1;33myo ' + type.substring( 10 ) + '\033[0m' );
                                        console.log( '\n\033[1;32m=======================================================\033[0m' );
                                    }
                                }
                            });
                        }
                    }
                });
            }
        }
    },

    /**
     * 获取指定版本的changelog
     * 该功能暂时针对github设计，主要思路是读取仓库中的CHANGELOG.md文件，内容格式必须为：
     *      https://raw.github.com/abc-team/generator-kissy-cake/master/CHANGELOG.md
     * @param repoURL github仓库地址
     * @param version 需要读取的版本号
     * @param done 回调
     */
    getChangeLog: function( repoURL, version, done ){

        var repoInfo = URL.parse( repoURL );

        /**
         * 暂时只针对github
         */
        if( repoInfo.hostname.indexOf( 'github.com' ) >= 0 ){

            var repoPath = (/\.git$/.test( repoInfo.path ) ?
                repoInfo.path.substring( 0, repoInfo.path.length - 4 ) :
                repoInfo.path ) + '/master/CHANGELOG.md';

            HTTPS.get('https://raw.github.com/' + repoPath + '?t=' + Date.now(), function(res) {

                var DATA = '';
                res.setEncoding('utf8');

                res.on('data', function (chunk) {
                    DATA += chunk;
                });


                res.on( 'end', function(){

                    // 对内容进行提取
                    var chunk = DATA.split( /#+\s*v?([\d\.]+)\s*\n/g );
                    var isVersion = true;
                    var lastVersion = null;
                    var changeLogs = {};
                    chunk.forEach(function( value ){

                        if( value = value.trim() ){

                            if( isVersion ){
                                lastVersion = value;
                            }
                            else {
                                changeLogs[ lastVersion ] = value;
                            }

                            isVersion = !isVersion;
                        }
                    });

                    done( null, changeLogs[ version ] );
                });

            }).on('error', function(e) {
                done( e );
            });
        }
    },

    /**
     * 获取当前的版本
     * @param pkg
     * @param done
     */
    getCurrentVersion: function( pkg, done ){

        Child.exec( 'npm ls ' + pkg + ' -g', function( err, stdout, stderr ){

            if( err ){
                done( err, stdout, stderr );
            }
            else {
                var EX = new RegExp( pkg + '@([\\.\\d]+)' );
                var ret = EX.exec( stdout );
                if( ret ){
                    return done( null, ret[ 1 ] );
                }
                else {
                    return done( null );
                }
            }
        });
    }
};