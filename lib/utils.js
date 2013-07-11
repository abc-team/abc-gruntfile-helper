/**
 * 与任务配置有关的一些公用方法
 */

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
    }
};