import ImageCommand from "../../classes/imageCommand.js";
import { cleanMessage } from "../../utils/misc.js";

class TrumpCommand extends ImageCommand {
  static description = "Makes Trump display an image";

  static noText = "You need to provide some text to add a caption!";
  static noImage = "You need to provide an image/GIF to add a caption!";
  static command = "trump";
}

export default TrumpCommand;
