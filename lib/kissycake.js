/**
 * @fileOverview
 * 用于Gruntfile.js的额外辅助，该文件作为一个独立的npm模块，通过package.json中默认制定来让用户安装
 */

/**
 * 与KISSY-Pie相关辅助方法
 */

var _ = require( 'underscore' );
var Utils = require( './utils' );
var Path = require( 'path' );
var FS = require( 'fs' );

/**
 * 定期检查 generator 是否有新版本
 */
Utils.getlastest( 'generator-kissy-cake' );

var KISSY_CAKE = {

    /**
     * 默认配置
     */
    DEFAULTS: {

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
     * 用于储存与KISSY-Cake相关的用户输入参数
     */
    options: {},

    /**
     * 解析同于输入
     * @param grunt
     * @param {Object} defaults 用户在Gruntfile中传进来的默认参数
     * @returns {Object} this.options
     */
    parse: function( grunt, defaults ){

        this.grunt = grunt;
        // grunt 默认执行 all
        this.taskName = Utils.getTaskName() || 'all';

        var options = {};

        // 命令行的优先级最高
        var CMDOptions = {};

        var pageTarget = grunt.option( 'page' );
        var widgetTarget = grunt.option( 'widget' );
        var watchFor = grunt.option( 'watch-for' );

        var pageTargetList = pageTarget ? pageTarget.split( ',' ) : defaults.pages;
        var widgetTargetList = widgetTarget ? widgetTarget.split( ',' ) : defaults.widgets;
        var pageInfoList = [];
        var widgetInfoList = [];

        if( typeof pageTargetList == 'string' ){
            pageTargetList = [ pageTargetList ];
        }

        if( typeof widgetTargetList == 'string' ){
            widgetTargetList = [ widgetTargetList ];
        }

        pageTargetList.forEach(function( targetString ){

            var pageInfo = {
                type: 'page',
                name: targetString
            };
            pageInfo.args = [ '--page', targetString ];

            pageInfoList.push(pageInfo);
        });

        widgetTargetList.forEach(function( targetString ){

            var widgetInfo = {
                type: 'widget',
                name: targetString
            };
            widgetInfo.args = [ '--widget', targetString ];

            widgetInfoList.push(widgetInfo);
        });

        CMDOptions = {
            pageInfoList: pageInfoList,
            widgetInfoList: widgetInfoList,
            pageName: pageInfoList[0] ? pageInfoList[0].name : '',
            widgetName: widgetInfoList[0] ? widgetInfoList[0].name : '',
            watchFor: watchFor
        };

        // 读取系统默认值
        options = _.defaults(_.clone( CMDOptions ),  _.clone( this.DEFAULTS ) );

        // 检查参数（是否为空等），出错会中断
        this.validation( options );

        this.options = options;

        return options;
    },

    /**
     * 检查用户配置项是否有误
     * todo 根据不同的情况做校验
     * @param options
     */
    validation: function( options ){

        var grunt = this.grunt;

        // 页面名称
        if( typeof options.pageName != 'string' ){
            grunt.fail.fatal( 'pageName 页面名称为空或者无效!' );
        }

        // 检查多页面的
        options.pageInfoList.forEach(function( pageInfo ){

            // 页面名称
            if( typeof pageInfo.name != 'string' ){
                grunt.fail.fatal( 'pageName 页面名称为空或者无效!' );
            }
        });
    },

    /**
     * 初始化任务配置
     * @param grunt
     */
    taskInit: function(){

        var grunt = this.grunt;
        var options = this.options;

        /**
         * 同时build page和widget
         */
        grunt.registerTask('build', function(){
            var taskList = [];
            if( options.pageName ){
                taskList.push( 'page' );
            }
            if( options.widgetName ){
                taskList.push( 'widget' );
            }
            grunt.task.run(taskList);
        });

        /**
         * 打包所有
         */
        grunt.registerTask('all', function(){

            var done = this.async();
            var targetLen = 0;
            var targetCount = 0;
            var targetList = [];

            // 找到所有的page和widget
            var PWD = process.cwd();
            var pageBasePath = Path.resolve( PWD, 'src/pages' );
            var widgetBasePath = Path.resolve( PWD, 'src/widget' );
            var pageList = [];
            var widgetList = [];


            FS.readdirSync( pageBasePath ).forEach(function( path ){
                var absPath = Path.resolve( pageBasePath, path );
                // 过滤掉如.sass-cache 这样的文件夹
                if( grunt.file.isDir( absPath ) && path.indexOf( '.' ) < 0 ){
                    pageList.push({
                        type: 'page',
                        name: path,
                        args: 'page --page ' + path
                    });
                }
            });

            FS.readdirSync( widgetBasePath ).forEach(function( path ){
                var absPath = Path.resolve( widgetBasePath, path );
                if( grunt.file.isDir( absPath ) && path.indexOf( '.' ) < 0 ){
                    widgetList.push( {
                        type: 'widget',
                        name: path,
                        args: 'widget --widget ' + path
                    } );
                }
            });

            targetList = pageList.concat( widgetList );
            targetLen = targetList.length;

            targetList.forEach(function( target ){
                Utils.spawn( grunt, {
                    grunt: true,
                    args: target.args.split( /\s+/ )
                }, function( error, result, code ){

                    if( error ){
                        console.log( '\n\033[1;31mBuild Error: \033[0m\n', result.stdout );
                    }
                    else {
                        console.log( result.stdout.replace( '\n\u001b[32mDone, without errors.\u001b[39m', '' ) );
                        if( target.type == 'page' ){
                            grunt.log.oklns( 'Page: ' + target.name + ' 打包完成.' );
                        }
                        if( target.type == 'widget' ){
                            grunt.log.oklns( 'Widget: ' + target.name + ' 打包完成.' );
                        }
                    }

                    grunt.log.writeln();

                    targetCount++;

                    if( targetCount == targetLen ){
                        grunt.log.oklns( '所有的widget和page都打包完成! 下面进行common打包：' );
                        done();
                    }
                });
            });

            // build common
            // common将在当前任务执行完 done方法后被执行。
            grunt.task.run(['common']);
        });

        // widget和page
        if( this.taskName == 'build' ){
            this.pageTaskInit();
            this.widgetTaskInit();
        }
        // 若未watch
        else if( this.taskName == 'watch' ){
            this.watchInit();
        }
        // build page
        else if( this.taskName == 'page' ){
            this.pageTaskInit();
        }
        // build widget
        else if( this.taskName == 'widget' ){
            this.widgetTaskInit();
        }
    },

    /**
     * page打包初始化
     */
    pageTaskInit: function(){

        var grunt = this.grunt;
        var options = this.options;
        var pageInfoList = options.pageInfoList;

        /**
         * 若为多任务，重写`page`
         */
        if( pageInfoList.length > 1 ){

            /**
             * 定义page任务
             */
            grunt.registerTask( 'page', function(){

                var done = this.async();
                var pageLen = pageInfoList.length;
                var pageCount = 0;

                pageInfoList.forEach(function( page ){

                    /**
                     * 创建新的grunt进程，该进程只执行一个page任务
                     */
                    Utils.spawn( grunt, {
                        grunt: true,
                        args: [ 'page' ].concat( page.args )
                    }, function( error, result, code ){

                        if( error ){
                            console.log( '\n\033[1;31mBuild Error: \033[0m\n', result.stdout );
                        }
                        else {
                            console.log( result.stdout.replace( '\n\u001b[32mDone, without errors.\u001b[39m', '' ) );
                            grunt.log.oklns( 'Page: ' + page.name + ' 打包完成.' );
                        }

                        grunt.log.writeln();

                        pageCount++;

                        if( pageCount == pageLen ){
                            done();
                        }
                    });
                });
            });
        }
        else if( this.taskName == 'page' && pageInfoList.length == 0 ){
            grunt.fail.fatal( '您尚未指定任何Page进行打包!' );
        }
    },

    /**
     * widget打包初始化
     */
    widgetTaskInit: function(){

        var grunt = this.grunt;
        var options = this.options;
        var widgetInfoList = options.widgetInfoList;

        /**
         * 若未多任务，重写`page`
         */
        if( widgetInfoList.length > 1 ){

            /**
             * 定义page任务
             */
            grunt.registerTask( 'widget', function(){

                var done = this.async();
                var widgetLen = widgetInfoList.length;
                var widgetCount = 0;

                widgetInfoList.forEach(function( widget ){

                    /**
                     * 创建新的grunt进程，该进程只执行一个page任务
                     */
                    Utils.spawn( grunt, {
                        grunt: true,
                        args: [ 'widget' ].concat( widget.args )
                    }, function( error, result, code ){

                        if( error ){
                            console.log( '\n\033[1;31mBuild Error: \033[0m\n', result.stdout );
                        }
                        else {
                            console.log( result.stdout.replace( '\n\u001b[32mDone, without errors.\u001b[39m', '' ) );
                            grunt.log.oklns( 'Widget: ' + widget.name + ' 打包完成.' );
                        }

                        grunt.log.writeln();

                        widgetCount++;

                        if( widgetCount == widgetLen ){
                            done();
                        }
                    });
                });
            });
        }
        else if( this.taskName == 'widget' && widgetInfoList.length == 0 ){
            grunt.fail.fatal( '您尚未指定任何Widget进行打包!' );
        }
    },

    /**
     * 用于watch类任务的重新定义和初始化
     */
    watchInit: function(){

        var grunt = this.grunt;
        var options = this.options;

        /**
         * 综合考虑page和widget
         */
        var widgetInfoList = options.widgetInfoList;
        var pageInfoList = options.pageInfoList;
        var watchFor = options.watchFor;
        var targetInfoList = [];

        /**
         * 通过 --watch-for 参数来指定是否只是watch 单个类型
         */
        if( watchFor == 'page' ){
            targetInfoList = pageInfoList;
        }
        else if( watchFor == 'widget' ){
            targetInfoList = widgetInfoList;
        }
        else if( watchFor != 'common' ){
            // 合并page和widget
            targetInfoList = pageInfoList.concat( widgetInfoList );
        }

        /**
         * 若需要watch多个实例
         */
        if( targetInfoList.length > 1 ){

            grunt.task.registerTask( 'watch', function(){

                this.async();

                targetInfoList.forEach(function( target ){

                    var args = [ 'watch' ].concat( target.args ).concat( '--watch-for', target.type );

                    Utils.spawn( grunt, {
                        grunt: true,
                        args: args
                    }, function( error, result, code ){

                        if( error ){
                            console.log( '\n\033[1;31mBuild Error: \033[0m\n', result.stdout );
                        }
                        else {
                            console.log( result.stdout.replace( '\n\u001b[32mDone, without errors.\u001b[39m', '' ) );
                        }
                    }, function( child ){
                        child.stdout.on('data', function (data) {
                            console.log( data.toString( 'utf8') );
                        });
                    });


                });

                // 额外产生一个线程进行common的watch
                Utils.spawn( grunt, {
                    grunt: true,
                    args: [ 'watch', '--watch-for', 'common' ]
                }, function( error, result, code ){

                    if( error ){
                        console.log( '\n\033[1;31mBuild Error: \033[0m\n', result.stdout );
                    }
                    else {
                        console.log( result.stdout.replace( '\n\u001b[32mDone, without errors.\u001b[39m', '' ) );
                    }
                }, function( child ){
                    child.stdout.on('data', function (data) {
                        console.log( data.toString( 'utf8') );
                    });
                });

            });
        }
        /**
         * 若只有一个watch
         */
        else {

            var watchConfig = grunt.config( 'watch' );
            var newWatchConfig = _.clone( watchConfig );

            // 根据是否只是监听page或者widget来动态设置watch的设置
            if( watchFor == 'page' ) {

                _.each( newWatchConfig, function( value, key ){
                    if( !(/.*_page$/.test(key)) ){
                        delete newWatchConfig[ key ];
                    }
                });
            } else if( watchFor == 'widget' ){

                _.each( newWatchConfig, function( value, key ){
                    if( !(/.*_widget$/.test(key)) ){
                        delete newWatchConfig[ key ];
                    }
                });
            } else if( watchFor == 'common' ){

                _.each( newWatchConfig, function( value, key ){
                    if( !(/.*_common$/.test(key)) ){
                        delete newWatchConfig[ key ];
                    }
                });
            }
            // 若只有一个page或者widget或者都为空，且只是纯粹的 grunt watch 进来
            else {
                if( targetInfoList[0] ){

                    _.each( newWatchConfig, function( value, key ){
                        if( ( !( new RegExp('.*_'+ targetInfoList[0].type + '$').test(key)) ) ){
                            delete newWatchConfig[ key ];
                        }
                    });

                    // 额外产生一个线程进行common的watch
                    Utils.spawn( grunt, {
                        grunt: true,
                        args: [ 'watch', '--watch-for', 'common' ]
                    }, function( error, result, code ){

                        if( error ){
                            console.log( '\n\033[1;31mBuild Error: \033[0m\n', result.stdout );
                        }
                        else {
                            console.log( result.stdout.replace( '\n\u001b[32mDone, without errors.\u001b[39m', '' ) );
                        }
                    }, function( child ){
                        child.stdout.on('data', function (data) {
                            console.log( data.toString( 'utf8') );
                        });
                    });
                }
                // 说明page和widget都木有，则只watch common
                else {
                    _.each( newWatchConfig, function( value, key ){
                        if( !(/.*_common$/.test(key)) ){
                            delete newWatchConfig[ key ];
                        }
                    });
                }
            }

            grunt.config( 'watch', newWatchConfig );
        }
    }
};

module.exports = KISSY_CAKE;