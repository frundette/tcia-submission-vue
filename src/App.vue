<template>
  <div id="app">
    <form-wizard   @on-loading="setLoading"  color="#4fc6f9">

      <h2 slot="title">TCIA Submission Tool</h2>

      <tab-content title="Configure" icon="ti-map" :before-change="importSubmissionTemplate">
        <p>Fill out <a class="link" href='/src/assets/tcia-submission-template.xlsx'>this Excel template</a> and save it on your computer.
          Our software will use this information to determine which Collection your patients belong in,
          and to replace your patient IDs and dates with anonymized ones.</p>
        <p>After filling out the template, import the file: <input type="file" accept=".xlsx" id="templateFile" /></p>
      </tab-content>

      <tab-content title="Prepare Data" icon="ti-files" :before-change="copyIntoPipelineAndDeidentify">
        <p>{{serverSpace}}</p>
        <p>Where is the DICOM data you’d like to submit?</p>
        <div class="center">
          <div style="float:left; width:2em">
            <button tabindex="-1" type="button" class="up-btn ti-arrow-up" v-on:click="upDirectoryClick">  Up </button>
          </div>
        </div>
        <v-jstree :data="fileSystem" allow-batch  v-on:dblclick.native="directoryDoubleClick" @item-click="directoryItemClick"></v-jstree>
        <p>Click 'Next' to import and anonymize the DICOM data.</p>
       <!-- TODO:
          See summary of selected data.  I don't believe this is currently possible.
        -->
      </tab-content>

      <tab-content title="Process & Review Data" icon="ti-search">
        <p>Your data has been processed. Review the results before transferring to TCIA.</p>

        <ul>
          <li>Patients Processed:  100</li>
          <li>Studies Processed:  5 </li>
          <li>Series Process:  10 </li>
          <li><a target="_blank" class="link" href="/quarantines?p=1&s=2">Quarantine Manager</a></li>
        </ul>
      </tab-content>

      <tab-content title="Transfer to TCIA" icon="ti-export" :before-change="transferToTCIA">
        <p>Your data is now de-identified. Click 'Next' to begin transmitting to TCIA.</p>

        <p>Do we want a treeview picker here to potentially select a subset of data to transfer?</p>
      </tab-content>

      <tab-content title="Finished" icon="ti-check">
        <p>Thanks for submitting your data.</p>
        <p><a class="link">Download the manifest</a> for your records.</p>

      </tab-content>

      <div class="loader" v-if="loadingWizard"></div>
    </form-wizard>
  </div>
</template>

<script>
export default {
  name: 'app',
  methods: {
    importSubmissionTemplate: function(){
      this.$http.get('/login/ajax?username=admin&password=tcia').then(response => {
        this.loggedIn = true;
        var file = document.getElementById('templateFile').files[0];
        var fileFormData = new FormData();
        fileFormData.append('file', file);
        this.$http.post('/Collection', fileFormData).then(response =>{
          var startingPath = this.currentFileSystemPath;
          this.getAvailableServerSpace();
          this.updateFileSystemTree(startingPath);
        }, response => {
          alert("There was a problem importing the file.");
        })
      }, response => {
        alert("There was a problem communicating with CTP.");
      });

      return true;
    },
    updateFileSystemTree: function(path){
      this.$http.get('/Collection/listFiles?dir='+path).then(response => {
        //var parser = new DOMParser();
        var xml = this.parser.parseFromString(response.body, "text/xml");
        var json = this.fileSystemXmlToJson(xml);
        this.fileSystem = json.children;
      },response => {
        alert("There was a problem retrieving directory information.");
      });
    },
    fileSystemXmlToJson: function(xml, parent=""){

      /*
         <dir  name="Directory" parent="absolutePath">
           <dir name="sub-directory"/>
           <file name="file"/>
         </dir>
         */

      var obj={};

      if (xml.nodeType == 9){
        obj["children"] = [];
        for (var j = 0 ; j < xml.childNodes.length; j++){
          obj["children"].push(this.fileSystemXmlToJson(xml.childNodes.item(j)));
        }
      }
      else if (xml.attributes && xml.attributes.length > 0) {
        obj["type"] = xml.nodeName;
        obj["text"] = xml.getAttribute('name');
        if(xml.getAttribute('parent')) {
          obj["parent"] = xml.getAttribute('parent');
          obj["path"] = xml.getAttribute('parent');
          if (obj["path"] != "/")
            (obj["path"] += "/");
          obj["path"] += obj["text"];
        }
        else if (parent.length > 0) {
          obj["path"] = parent + "/" + obj["text"];
        }

        if (xml.nodeName == "dir") {
          obj["opened"] = true;
          obj["icon"] = "ti-folder";
          if (xml.hasChildNodes()) {
            obj["children"] = [];
            for (var i = 0; i < xml.childNodes.length; i++) {
              var item = xml.childNodes.item(i);
              if (item.nodeName == "dir" || item.nodeName == "file")
                obj["children"].push(this.fileSystemXmlToJson(item, obj["path"]));
            }
          }
        }
        else if (xml.nodeName == "file") {
          obj["icon"] = "ti-file"
        }
      }

      return obj;
    },
    copyIntoPipelineAndDeidentify: function () {

      this.$http.get('/Collection/submitFile?file=' + this.currentFileSystemPath).then(response => {
        console.log("files submitted " + response.body)
        //In pipeline.  Now de-identify
        this.$http.get('/Collection/anonymize?file=DirectoryStorageService').then(response =>{
          console.log("finished anonymizing " + response.body);

          //get the anonymized list
          this.$http.get('Collection/listAnonymized').then(response =>{
            var xml = this.parser.parseFromString(response.body, "text/xml");
            console.log(response.body);
          }, response=> {
            alert("There was a problem retrieving the anonymized list.")
          });

        }, response => {
          alert ("Error anonymizing files.")
        });

      }, response => {
        alert("There was a problem copying the files into the import pipeline.")
      });
      return true;
    },
    transferToTCIA: function () {
      var filepath = "DirectoryStorageService";
      this.$http.get('/Collection/export?file='+filepath).then(response => {
        console.log("export started " + response.body);
      }, response => {
        alert("There was a problem exporting the files.")
      });
      return true;
    },
    directoryItemClick: function (node) {
      this.currentFileSystemPath = node.model.path;
      this.currentPathIsDir = (node.model.type == "dir" ?  true: false);
    },
    directoryDoubleClick: function() {
      if (this.currentPathIsDir)
        this.updateFileSystemTree(this.currentFileSystemPath);
    },
    upDirectoryClick: function(){
      this.updateFileSystemTree(this.fileSystem[0].parent);
    },
    getAvailableServerSpace: function () {
      // <space partition="D:\" available="434932" units="MB"/>
      this.$http.get('/Collection/getAvailableSpace').then(response => {
        var xml = this.parser.parseFromString(response.body, "text/xml");
        var partition = xml.getElementsByTagName("space")[0].getAttribute("partition");
        var available = xml.getElementsByTagName("space")[0].getAttribute("available");
        var units = xml.getElementsByTagName("space")[0].getAttribute("units");

        this.serverSpace = available + " " + units + " available on partition " + partition;
      }, response=> {
        alert ("There was a problem finding the available server space.");
      });
    },
    setLoading: function(value) {
      this.loadingWizard = value
    }
  },
  data () {
    return {
      loadingWizard: false,
      parser: new DOMParser(),
      serverSpace: "0",
      currentFileSystemPath: "/Users",
      currentPathIsDir: true,
      fileSystem: [
        {
          "text": "Retrieving directory information",
          "opened": true,
          "icon": "ti-alert"
        }]
      }
    }
}

</script>

<style lang="scss">
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #ffffff;
  margin-top: 60px;
}

h1, h2 {
  font-weight: normal;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  display: inline-block;
  margin: 0 10px;
}

.link{
  color: #FFDC00
}

.up-btn{
  background-color: rgb(79, 198, 249);
  border-color: rgb(79, 198, 249);
  color: white;
}

.center {
  margin: auto;
  width: 50%;
}
</style>
