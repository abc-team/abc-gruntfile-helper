/**
 * @fileOverview
 * 用于Gruntfile.js的额外辅助，该文件可以考虑作为一个独立的npm模块，通过package.json中默认制定来让用户安装
 */

/**
 * 与KISSY-Pie相关辅助方法
 */

var _ = require( 'underscore' );
var Utils = require( './utils' );

var DATE = new Date;
var TIMESTAMP = '' + DATE.getFullYear() + DATE.getMonth() + 1 + DATE.getDate();

/**
 * 定期检查 generator 是否有新版本
 */
Utils.getlastest( 'generator-kissy-pie' );

var KISSY_PIE = {

    /**
     * 默认配置
     */
    DEFAULTS: {
        // 若用户不给定timestamp，则使用当前时间
        timestamp: TIMESTAMP,
        pageName: null,
        version: null,
        pkgName: 'page'
    },

    /**
     * grunt对象
     */
    grunt: null,

    /**
     * 当前执行时的grunt任务
     */
    taskName: null,

    /**
     * 用于储存与KISSY-Pie相关的用户输入参数
     */
    options: {},

    /**
     * 解析同于输入
     * @param grunt
     * @returns {Object} this.options
     */
    parse: function( grunt, defaults ){

        this.grunt = grunt;
        // 默认grunt命令执行page任务
        this.taskName = Utils.getTaskName() || 'page';

        var options = {};
        // 命令行的优先级最高
        var CMDOptions = {};
        var target = grunt.option( 'target' );
        var timestamp = grunt.option( 'ts' ) || defaults.timestamp || this.DEFAULTS.timestamp;;
        var pkgName = grunt.option( 'pkg' ) || this.DEFAULTS.pkgName;

        var targetList = target ? target.split( ',' ) : defaults.buildPages;
        var pageInfoList = [];

        if( typeof targetList == 'string' ){
            targetList = [ targetList ];
        }

        targetList.forEach(function( targetString, index ){

            var pageInfoSeg = targetString.split( '/' );
            var pageInfo = {
                pageName: pageInfoSeg[ 0 ],
                version: pageInfoSeg[ 1 ],
                pkgName: pageInfoSeg[ 2 ] || pkgName
            };
            pageInfo.args = [ '--target', targetString, '--ts', timestamp, '--pkg', pageInfo.pkgName ];

            pageInfoList.push(pageInfo);
        });

        CMDOptions = {
            pkgName: pageInfoList[0].pkgName,
            timestamp: timestamp,
            buildPages: targetList,
            pageInfoList: pageInfoList,
            // 下面两个字段为第一个pageInfo的值，方便用于单个页面的情况
            pageName: pageInfoList[0].pageName,
            version: pageInfoList[0].version
        };

        // 读取用户在Gruntfile中写入的默认值
        options = _.defaults(_.clone( CMDOptions ), defaults );

        // 读取系统默认值
        options = _.defaults( options, _.clone( this.DEFAULTS ) );

        // 检查参数，出错会中断
        this.validation( options );
        this.options = options;
        return options;
    },

    /**
     * 检查用户配置项是否有误
     * @param options
     */
    validation: function( options ){

        var grunt = this.grunt;

        // 页面名称
        if( typeof options.pageName != 'string' ){
            grunt.fail.fatal( 'pageName 页面名称为空或者无效!' );
        }

        // 页面源码版本
        if( typeof options.version != 'string' ){
            grunt.fail.fatal( 'version 页面源码版本为空或者无效!' );
        }

        // 检查多页面的 pageName/version/pkgName
        options.pageInfoList.forEach(function( pageInfo ){

            // 页面名称
            if( typeof pageInfo.pageName != 'string' ){
                grunt.fail.fatal( 'pageName 页面名称为空或者无效!' );
            }

            // 页面源码版本
            if( typeof pageInfo.version != 'string' ){
                grunt.fail.fatal( 'version 页面源码版本为空或者无效!' );
            }

            // 页面源码版本
            if( typeof pageInfo.pkgName != 'string' ){
                grunt.fail.fatal( 'version 报名配置为空或者无效!' );
            }
        });
    },

    /**
     * 初始化任务配置
     * @param grunt
     */
    taskInit: function( grunt ){

        var options = this.options;
        var pageInfoList = options.pageInfoList;

        /**
         * 多为多任务，重写`page`
         */
        if( pageInfoList.length > 1 && this.taskName == 'page' ){

            /**
             * 定义page任务
             */
            grunt.registerTask( 'page', function(){

                var done = this.async();
                var pageLen = pageInfoList.length;
                var pageCount = 0;

                pageInfoList.forEach(function( page ){

                    Utils.spawn( grunt, {
                        grunt: true,
                        args: [ 'page' ].concat( page.args )
                    }, function( error, result, code ){

                        if( error ){
                            console.log( code );
                        }
                        else {
                            console.log( result.stdout.replace( '\n\u001b[32mDone, without errors.\u001b[39m', '' ) );
                        }

                        // todo Log是否可优化
                        grunt.log.oklns( page.pageName + '/' + page.version + ' finished.' );
                        grunt.log.writeln();

                        pageCount++;

                        if( pageCount == pageLen ){
                            done();
                        }
                    });
                });
            });
        }

        /**
         * 当具有多个页面时， 重写watch，这里有递归的思想在里面...
         * 下方代码的编写思路，和watch插件的一个bug有关：参考issue: https://github.com/gruntjs/grunt-contrib-watch/issues/159
         */
        if( this.taskName == 'watch' ){

            var watchConfig = grunt.config( 'watch' );
            var newWatchConfig = _.clone( watchConfig );

            /**
             * 若为只watch common，则删掉所有watch page的配置
             */
            if( grunt.option( 'only-common' ) ){

                _.each( newWatchConfig, function( value, key ){
                    if( key.indexOf( 'page_' ) == 0 ){
                        delete newWatchConfig[ key ];
                    }
                });

                grunt.config( 'watch', newWatchConfig );
            }
            /**
             * 若其他类型的watch
             */
            else {

                /**
                 * 若存在多page，则针对每个page开启一个watch线程，并额外一个线程watch common
                 */
                if( pageInfoList.length > 1 && this.taskName == 'watch' ){

                    grunt.task.registerTask( 'watch', function(){

                        var done = this.async();

                        pageInfoList.forEach(function( page ){

                            var args = [ 'watch' ].concat( page.args );
                            var child = Utils.spawn( grunt, {
                                grunt: true,
                                args: args
                            });

                            child.stdout.on('data', function (data) {
                                console.log( data.toString( 'utf8') );
                            });

                            child.stderr.on('data', function (data) {
                                console.log( data.toString( 'utf8') );
                            });
                        });

                        /**
                         * 额外开启一个线程进行common的watch
                         */
                        var child = Utils.spawn( grunt, {
                            grunt: true,
                            args: [ 'watch', '--only-common' ]
                        });

                        child.stdout.on('data', function (data) {
                            console.log( data.toString( 'utf8') );
                        });

                        child.stderr.on('data', function (data) {
                            console.log( data.toString( 'utf8') );
                        });

                    });
                }
                /**
                 * 至此则为单个page的watch，去掉所有common相关的watch
                 */
                else {

                    _.each( newWatchConfig, function( value, key ){
                        if( key.indexOf( 'common_' ) == 0 ){
                            delete newWatchConfig[ key ];
                        }
                    });

                    grunt.config( 'watch', newWatchConfig );
                }
            }
        }
    }
};

module.exports = KISSY_PIE;